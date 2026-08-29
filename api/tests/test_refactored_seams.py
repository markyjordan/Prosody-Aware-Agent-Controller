import asyncio
import json
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from prosody_api.app import create_app
from prosody_api.core.artifacts import ProsodyArtifactLocator
from prosody_api.core.config import Settings
from prosody_api.core.dependencies import DependencyContainer
from prosody_api.schemas import ConditionRequest, Prosody, ProsodyRequest
from prosody_api.services import llm_service
from prosody_api.services.condition_service import ConditionOrchestrator
from prosody_api.services.prosody_service import DefaultProsodyPredictor
from prosody_api.services.tts_service import (
    ElevenLabsTTSProvider,
    FileAudioCache,
    StreamingTTSSynthesizer,
    TTSPrefetcher,
    TTSService,
    _cache_path,
)


def make_settings(tmp_path, **overrides):
    values = {
        "elevenlabs_api_key": None,
        "openai_api_key": None,
        "voice_id": "default-voice",
        "model_id": "default-model",
        "openai_model": "default-llm",
        "probe_path": tmp_path / "probe.pt",
        "cache_dir": tmp_path / "cache",
        "auth_enabled": False,
        "auth_api_key": None,
        "rate_limit_enabled": False,
        "rate_limit": 60,
        "rate_window": 60,
    }
    values.update(overrides)
    return Settings(**values)


def parse_sse(response) -> list[dict]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


class FakeClock:
    def __init__(self):
        self.monotonic_value = 10.0
        self.wall_value = 100.0

    def monotonic(self):
        self.monotonic_value += 0.005
        return self.monotonic_value

    def time(self):
        return self.wall_value


class FakeTaskSpawner:
    def __init__(self):
        self.calls = []

    def spawn(self, target, *args):
        self.calls.append((target, args))
        target(*args)


class FakeLLM:
    def __init__(self, *deltas):
        self.deltas = deltas
        self.prompts = []

    async def _stream(self):
        for delta in self.deltas:
            yield delta

    def stream(self, prompt):
        self.prompts.append(prompt)
        return self._stream()


class FakeTTS:
    def __init__(self):
        self.synthesis = []
        self.prefetches = []

    def get_cached_audio(self, voice_id, model_id, text):
        return None

    def synthesize_stream(self, voice_id, model_id, text):
        self.synthesis.append((voice_id, model_id, text))
        return iter([b"fake-audio"])

    def prefetch(self, text, voice_id=None, model_id=None):
        self.prefetches.append((text, voice_id, model_id))


class FakeProsodyPredictor:
    def __init__(self):
        self.requests = []

    def predict(self, request):
        self.requests.append(request)
        return Prosody(labels=["injected"], confidence=0.8)


def test_create_app_uses_injected_ports_and_infrastructure(tmp_path):
    llm = FakeLLM("injected ", "response")
    tasks = FakeTaskSpawner()
    tts = FakeTTS()
    prosody = FakeProsodyPredictor()
    dependencies = DependencyContainer(
        settings=make_settings(tmp_path),
        clock=FakeClock(),
        request_id_provider=lambda: "fixed-id",
        task_spawner=tasks,
        llm=llm,
        condition_prompt_builder=lambda transcript, _prosody: (
            f"baseline:{transcript}",
            f"conditioned:{transcript}",
        ),
        tts=tts,
        prosody_predictor=prosody,
    )
    app = create_app(dependencies=dependencies)

    with TestClient(app) as client:
        condition = client.post(
            "/api/condition/prosodic",
            json={"history": [], "turn": {"transcript": "hello"}},
        )
        audio = client.post(
            "/api/tts",
            json={"text": "speak", "voice_id": "voice", "model_id": "model"},
        )
        prediction = client.post("/api/prosody", json={"text": "listen"})

    assert app.state.dependencies is dependencies
    assert condition.headers["x-request-id"] == "fixed-id"
    assert parse_sse(condition) == [
        {"type": "delta", "text": "injected "},
        {"type": "delta", "text": "response"},
        {"type": "done"},
    ]
    assert llm.prompts == ["conditioned:hello"]
    assert tts.prefetches == [("injected response", None, None)]
    assert len(tasks.calls) == 1
    assert audio.content == b"fake-audio"
    assert tts.synthesis == [("voice", "model", "speak")]
    assert prediction.json() == {
        "labels": ["injected"],
        "features": None,
        "confidence": 0.8,
    }
    assert prosody.requests == [ProsodyRequest(text="listen")]


def test_create_app_rejects_ambiguous_configuration_and_settings_are_frozen(
    tmp_path,
):
    settings = make_settings(tmp_path)
    dependencies = DependencyContainer(settings)

    with pytest.raises(ValueError, match="settings or dependencies"):
        create_app(settings=settings, dependencies=dependencies)
    with pytest.raises(FrozenInstanceError):
        settings.voice_id = "changed"


def collect_events(orchestrator, request, disconnected):
    async def collect():
        return [
            event
            async for event in orchestrator.events(
                "prosodic", request, disconnected
            )
        ]

    return asyncio.run(collect())


def test_condition_orchestrator_disconnects_before_emitting_delta():
    llm = FakeLLM("unused")
    orchestrator = ConditionOrchestrator(
        llm=llm,
        build_prompts=lambda transcript, _prosody: (transcript, f"p:{transcript}"),
    )

    async def disconnected():
        return True

    events = collect_events(
        orchestrator,
        ConditionRequest(turn={"transcript": "hello"}),
        disconnected,
    )

    assert events == [{"type": "done"}]
    assert llm.prompts == ["p:hello"]


def test_condition_orchestrator_maps_failures_but_propagates_cancellation():
    class FailingLLM:
        async def _stream(self):
            raise RuntimeError("failed")
            yield

        def stream(self, _prompt):
            return self._stream()

    class CancelledLLM:
        async def _stream(self):
            raise asyncio.CancelledError
            yield

        def stream(self, _prompt):
            return self._stream()

    async def connected():
        return False

    request = ConditionRequest(turn={"transcript": "hello"})
    build = lambda transcript, _prosody: (transcript, transcript)
    assert collect_events(
        ConditionOrchestrator(FailingLLM(), build), request, connected
    ) == [{"type": "error", "message": "failed"}]
    with pytest.raises(asyncio.CancelledError):
        collect_events(ConditionOrchestrator(CancelledLLM(), build), request, connected)


def test_artifact_locator_preserves_configured_then_fallback_precedence(tmp_path):
    configured = tmp_path / "configured.pt"
    fallback = tmp_path / "fallback.pt"
    locator = ProsodyArtifactLocator(configured, fallback)

    missing = locator.discover()
    assert missing.found is False
    assert missing.selected_path == configured

    fallback.write_bytes(b"fallback")
    fallback_result = locator.discover()
    assert fallback_result.found is True
    assert fallback_result.selected_path == fallback
    assert fallback_result.configured_path == configured

    configured.write_bytes(b"configured")
    configured_result = locator.discover()
    assert configured_result.selected_path == configured


def test_default_prosody_predictor_keeps_heuristic_with_present_artifact(tmp_path):
    configured = tmp_path / "probe.pt"
    configured.write_bytes(b"artifact")
    predictor = DefaultProsodyPredictor(
        ProsodyArtifactLocator(configured, tmp_path / "fallback.pt")
    )

    result = predictor.predict(ProsodyRequest(text="hello"))

    assert result.labels == []
    assert result.confidence == 0.42
    assert result.features.speechRate == 3.9


class FakeProvider:
    def __init__(self, chunks=()):
        self.chunks = chunks
        self.calls = []

    def stream(self, voice_id, model_id, text):
        self.calls.append((voice_id, model_id, text))
        return iter(self.chunks)


def test_tts_objects_cover_cache_stream_and_prefetch_boundaries(tmp_path):
    cache = FileAudioCache(tmp_path / "cache")
    provider = FakeProvider([b"one", b"", b"two"])
    synthesizer = StreamingTTSSynthesizer(cache, provider)
    prefetcher = TTSPrefetcher(cache, synthesizer, "voice", "model")
    service = TTSService(cache, synthesizer, prefetcher)

    assert b"".join(service.synthesize_stream("voice", "model", "text")) == (
        b"onetwo"
    )
    cached = service.get_cached_audio("voice", "model", "text")
    assert cached is not None
    assert cached.read_bytes() == b"onetwo"
    assert b"".join(service.synthesize_stream("voice", "model", "text")) == (
        b"onetwo"
    )
    assert provider.calls == [("voice", "model", "text")]

    service.prefetch("text")
    assert provider.calls == [("voice", "model", "text")]


def test_tts_synthesizer_swallows_cache_write_failure():
    class BrokenCache:
        def get(self, *_args):
            return None

        def save(self, *_args):
            raise OSError("read only")

    synthesizer = StreamingTTSSynthesizer(BrokenCache(), FakeProvider([b"audio"]))

    assert list(synthesizer.stream("voice", "model", "text")) == [b"audio"]


def test_tts_prefetcher_swallows_provider_failure(tmp_path):
    class BrokenSynthesizer:
        def stream(self, *_args):
            raise RuntimeError("provider failed")

    prefetcher = TTSPrefetcher(
        FileAudioCache(tmp_path),
        BrokenSynthesizer(),
        "voice",
        "model",
    )

    assert prefetcher.prefetch("text", voice_id="custom") is None


def test_elevenlabs_provider_maps_client_failure():
    provider = ElevenLabsTTSProvider(
        lambda: (_ for _ in ()).throw(RuntimeError("no client"))
    )

    with pytest.raises(HTTPException) as exc_info:
        provider.stream("voice", "model", "text")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "ElevenLabs TTS failed: no client"


def test_legacy_cache_path_remains_compatible(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "prosody_api.services.tts_service.get_settings",
        lambda: {"cache_dir": tmp_path},
    )

    path = _cache_path("voice", "model", "text")

    assert path.parent == tmp_path
    assert path.suffix == ".mp3"


def test_llm_client_creation_respects_key_and_optional_dependency(monkeypatch):
    calls = []
    monkeypatch.setattr(
        llm_service,
        "get_settings",
        lambda: {"openai_api_key": "key"},
    )
    monkeypatch.setattr(
        llm_service,
        "OpenAI",
        lambda api_key: calls.append(api_key) or object(),
    )
    assert llm_service._get_client() is not None
    assert calls == ["key"]

    monkeypatch.setattr(llm_service, "OpenAI", None)
    assert llm_service._get_client() is None
