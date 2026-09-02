import asyncio
import hashlib

import pytest
from fastapi import HTTPException

from prosody_api.core import config
from prosody_api.schemas import Prosody
from prosody_api.services import llm_service, prosody_service, tts_service
from prosody_api.services.controller_service import build_requests, infer_policy


def collect_async(iterator):
    async def collect():
        return [item async for item in iterator]

    return asyncio.run(collect())


@pytest.mark.parametrize(
    ("labels", "expected"),
    [
        ([], "neutral"),
        (["uncertain"], "user is uncertain/hesitant"),
        (["hesitant"], "user is uncertain/hesitant"),
        (["sarcastic"], "user is frustrated/sarcastic"),
        (["frustrated"], "user is frustrated/sarcastic"),
        (["confident"], "user is confident"),
        (["unknown"], "neutral"),
    ],
)
def test_controller_policy_precedence(labels, expected):
    result = infer_policy("ignored", Prosody(labels=labels))
    assert result.startswith(expected)


def test_controller_without_prosody_and_conditioned_format():
    assert infer_policy("ignored", None) == "neutral"
    baseline, conditioned = build_requests(
        "transcript",
        Prosody(labels=["confident"], confidence=None),
    )

    assert baseline == "transcript"
    assert conditioned == (
        "transcript\n[prosody policy: user is confident — proceed directly]"
        "\n[labels: confident conf=None]"
    )


def test_llm_provider_free_fallback(monkeypatch):
    monkeypatch.setattr(llm_service, "_get_client", lambda: None)
    monkeypatch.setattr(
        llm_service,
        "get_settings",
        lambda: {"openai_model": "unused"},
    )

    deltas = collect_async(llm_service.stream_llm("one two"))

    assert deltas == ["one ", "two ", "(mock ", "LLM) "]


def test_llm_provider_stream_uses_model_and_skips_empty_deltas(monkeypatch):
    class Stream:
        def __init__(self):
            self.events = iter(
                [
                    type("Event", (), {"type": "response.created"})(),
                    type(
                        "Event",
                        (),
                        {"type": "response.output_text.delta", "delta": "hello"},
                    )(),
                ]
            )

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def __aiter__(self):
            return self

        async def __anext__(self):
            try:
                return next(self.events)
            except StopIteration:
                raise StopAsyncIteration

    class Responses:
        def stream(self, **kwargs):
            self.kwargs = kwargs
            return Stream()

    responses = Responses()
    client = type("Client", (), {"responses": responses})()
    monkeypatch.setattr(llm_service, "_get_client", lambda: client)
    monkeypatch.setattr(
        llm_service,
        "get_settings",
        lambda: {
            "openai_model": "chosen-model",
            "openai_reasoning_effort": "none",
            "openai_max_output_tokens": 256,
        },
    )

    assert collect_async(llm_service.stream_llm("prompt")) == ["hello"]
    assert responses.kwargs == {
        "model": "chosen-model",
        "input": "prompt",
        "reasoning": {"effort": "none"},
        "max_output_tokens": 256,
        "store": False,
    }


def test_settings_cleaning_defaults_and_environment(monkeypatch, tmp_path):
    for key in (
        "ELEVENLABS_API_KEY",
        "OPENAI_API_KEY",
        "ELEVENLABS_VOICE_ID",
        "ELEVENLABS_MODEL_ID",
        "OPENAI_MODEL",
        "OPENAI_REASONING_EFFORT",
        "OPENAI_MAX_OUTPUT_TOKENS",
        "ELEVENLABS_ASR_MODEL",
        "LATENCY_PROFILE_PATH",
        "PROSODY_TIMEOUT_SECONDS",
        "PROBE_PATH",
        "TTS_CACHE_DIR",
    ):
        monkeypatch.delenv(key, raising=False)
    config.get_settings.cache_clear()

    defaults = config.get_settings()
    assert defaults["elevenlabs_api_key"] is None
    assert defaults["openai_api_key"] is None
    assert defaults["voice_id"] == "cgSgspJ2msm6clMCkdW9"
    assert defaults["model_id"] == "eleven_v3"
    assert defaults["openai_model"] == "gpt-5.6-luna"
    assert defaults["openai_reasoning_effort"] == "none"

    monkeypatch.setenv("OPENAI_API_KEY", ' "openai" ')
    monkeypatch.setenv("ELEVENLABS_API_KEY", "'eleven'")
    monkeypatch.setenv("PROBE_PATH", str(tmp_path / "probe.pt"))
    monkeypatch.setenv("TTS_CACHE_DIR", str(tmp_path / "cache"))
    config.get_settings.cache_clear()
    configured = config.get_settings()

    assert configured["openai_api_key"] == "openai"
    assert configured["elevenlabs_api_key"] == "eleven"
    assert configured["probe_path"] == tmp_path / "probe.pt"
    assert configured["cache_dir"] == tmp_path / "cache"

    monkeypatch.setenv("LATENCY_PROFILE_PATH", "off")
    config.get_settings.cache_clear()
    assert config.get_settings()["latency_profile_path"] is None
    config.get_settings.cache_clear()


def test_prosody_fallback_ignores_text_and_audio(monkeypatch, tmp_path):
    monkeypatch.setattr(
        prosody_service,
        "get_settings",
        lambda: {"probe_path": tmp_path / "missing.pt"},
    )

    result = prosody_service.predict(text="anything", audio_b64="anything")

    assert result.labels == []
    assert result.confidence == 0.42
    assert result.features.f0Mean == 181.2


def test_tts_cache_hash_path_and_nonempty_requirement(monkeypatch, tmp_path):
    monkeypatch.setattr(
        tts_service,
        "get_settings",
        lambda: {"cache_dir": tmp_path},
    )
    expected = hashlib.sha256(b"voice:model:text").hexdigest()

    assert tts_service._hash_key("voice", "model", "text") == expected
    assert tts_service.get_cached_audio("voice", "model", "text") is None

    path = tmp_path / f"{expected}.mp3"
    path.write_bytes(b"")
    assert tts_service.get_cached_audio("voice", "model", "text") is None
    path.write_bytes(b"audio")
    assert tts_service.get_cached_audio("voice", "model", "text") == path


def test_tts_save_and_cached_stream(monkeypatch, tmp_path):
    monkeypatch.setattr(
        tts_service,
        "get_settings",
        lambda: {"cache_dir": tmp_path},
    )
    path = tts_service.save_to_cache("voice", "model", "text", b"audio")

    assert path.read_bytes() == b"audio"
    assert b"".join(tts_service.synthesize_stream("voice", "model", "text")) == (
        b"audio"
    )


def test_tts_client_requires_key_and_strips_quotes(monkeypatch):
    monkeypatch.setattr(
        tts_service,
        "get_settings",
        lambda: {"elevenlabs_api_key": None},
    )
    with pytest.raises(HTTPException) as exc_info:
        tts_service.get_eleven_client()
    assert exc_info.value.status_code == 500

    calls = []
    monkeypatch.setattr(
        tts_service,
        "get_settings",
        lambda: {"elevenlabs_api_key": '"secret"'},
    )
    monkeypatch.setattr(
        tts_service,
        "ElevenLabs",
        lambda api_key: calls.append(api_key) or object(),
    )
    assert tts_service.get_eleven_client() is not None
    assert calls == ["secret"]


def test_tts_provider_error_maps_to_bad_gateway(monkeypatch, tmp_path):
    class TextToSpeech:
        def convert(self, **_kwargs):
            raise RuntimeError("upstream")

    client = type("Client", (), {"text_to_speech": TextToSpeech()})()
    monkeypatch.setattr(
        tts_service,
        "get_settings",
        lambda: {"cache_dir": tmp_path},
    )
    monkeypatch.setattr(tts_service, "get_eleven_client", lambda: client)

    with pytest.raises(HTTPException) as exc_info:
        tts_service.synthesize_stream("voice", "model", "text")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "ElevenLabs TTS failed: upstream"


def test_tts_stream_caches_partial_output(monkeypatch, tmp_path):
    class FailingAudio:
        def __iter__(self):
            yield b"partial"
            raise RuntimeError("stream failed")

    class TextToSpeech:
        def convert(self, **_kwargs):
            return FailingAudio()

    client = type("Client", (), {"text_to_speech": TextToSpeech()})()
    monkeypatch.setattr(
        tts_service,
        "get_settings",
        lambda: {"cache_dir": tmp_path},
    )
    monkeypatch.setattr(tts_service, "get_eleven_client", lambda: client)
    stream = tts_service.synthesize_stream("voice", "model", "text")

    with pytest.raises(RuntimeError, match="stream failed"):
        list(stream)

    cached = tts_service.get_cached_audio("voice", "model", "text")
    assert cached is not None
    assert cached.read_bytes() == b"partial"


def test_tts_prefetch_uses_defaults_and_swallows_failures(monkeypatch):
    calls = []
    monkeypatch.setattr(
        tts_service,
        "get_settings",
        lambda: {"voice_id": "default-voice", "model_id": "default-model"},
    )
    monkeypatch.setattr(tts_service, "get_cached_audio", lambda *_args: None)

    def failing_stream(*args):
        calls.append(args)
        raise RuntimeError("ignored")

    monkeypatch.setattr(tts_service, "synthesize_stream", failing_stream)

    assert tts_service.prefetch("hello") is None
    assert calls == [("default-voice", "default-model", "hello")]


def test_tts_prefetch_skips_existing_cache(monkeypatch):
    monkeypatch.setattr(
        tts_service,
        "get_settings",
        lambda: {"voice_id": "voice", "model_id": "model"},
    )
    monkeypatch.setattr(tts_service, "get_cached_audio", lambda *_args: object())
    monkeypatch.setattr(
        tts_service,
        "synthesize_stream",
        lambda *_args: pytest.fail("cached audio should skip synthesis"),
    )

    assert tts_service.prefetch("hello") is None
