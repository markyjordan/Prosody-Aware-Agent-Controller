import json
from pathlib import Path

from fastapi import HTTPException

from prosody_api.routers import controller as controller_router
from prosody_api.routers import tts as tts_router


def sse_events(response) -> list[dict]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


def condition_payload(**turn):
    return {"history": [], "turn": {"transcript": "Please help", **turn}}


def test_health_routes_and_request_id(client):
    for path in ("/health", "/api/health"):
        response = client.get(path, headers={"x-request-id": "known-id"})

        assert response.status_code == 200
        assert response.json() == {"ok": True}
        assert response.headers["x-request-id"] == "known-id"
        assert "x-ratelimit-limit" not in response.headers


def test_audio_websocket_is_not_mounted(client):
    response = client.get("/ws")

    assert response.status_code == 404


def test_condition_baseline_stream_and_arbitrary_branch_fallback(client):
    baseline = client.post("/api/condition/baseline", json=condition_payload())
    arbitrary = client.post("/api/condition/anything", json=condition_payload())

    baseline_events = sse_events(baseline)
    arbitrary_events = sse_events(arbitrary)
    assert baseline.status_code == 200
    assert baseline.headers["content-type"].startswith("text/event-stream")
    assert baseline.headers["cache-control"] == "no-cache"
    assert baseline_events[-1] == {"type": "done"}
    assert arbitrary_events == baseline_events
    assert "Please help (mock LLM)" == "".join(
        event.get("text", "") for event in baseline_events
    ).strip()


def test_condition_prosodic_uses_turn_prosody_before_top_level(client):
    response = client.post(
        "/api/condition/prosodic",
        json={
            **condition_payload(
                prosody={"labels": ["uncertain"], "confidence": 0.75}
            ),
            "prosody": {"labels": ["confident"], "confidence": 0.99},
        },
    )

    text = "".join(event.get("text", "") for event in sse_events(response))
    assert response.status_code == 200
    assert "uncertain/hesitant" in text
    assert "confident" not in text


def test_condition_ignores_model_parsed_top_level_prosody(client):
    response = client.post(
        "/api/condition/prosodic",
        json={
            **condition_payload(),
            "prosody": {"labels": ["confident"], "confidence": 0.9},
        },
    )

    text = "".join(event.get("text", "") for event in sse_events(response))
    assert "prosody policy: neutral" in text


def test_condition_accepts_permissive_turn_and_extra_fields(client):
    response = client.post(
        "/api/condition/baseline",
        json={
            "history": "not validated beyond being a list",
            "turn": {"unexpected": True},
            "ignored": "extra",
        },
    )

    assert response.status_code == 422
    details = response.json()["details"]
    assert any(detail["loc"] == ["body", "history"] for detail in details)

    permissive = client.post(
        "/api/condition/baseline",
        json={"history": ["anything"], "turn": {"unexpected": True}, "ignored": True},
    )
    assert permissive.status_code == 200
    assert sse_events(permissive)[-1] == {"type": "done"}


def test_condition_streams_error_without_done(client, monkeypatch):
    async def failing_stream(_prompt):
        yield "first "
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(controller_router, "stream_llm", failing_stream)
    response = client.post("/api/condition/baseline", json=condition_payload())

    assert sse_events(response) == [
        {"type": "delta", "text": "first "},
        {"type": "error", "message": "provider unavailable"},
    ]


def test_condition_prefetches_accumulated_text(client, monkeypatch):
    calls = []

    async def fixed_stream(_prompt):
        yield "hello "
        yield "world"

    class ImmediateThread:
        def __init__(self, target, args, daemon):
            self.target = target
            self.args = args
            self.daemon = daemon

        def start(self):
            self.target(*self.args)

    monkeypatch.setattr(controller_router, "stream_llm", fixed_stream)
    monkeypatch.setattr(controller_router, "prefetch", calls.append)
    monkeypatch.setattr("threading.Thread", ImmediateThread)

    response = client.post("/api/condition/baseline", json=condition_payload())

    assert response.status_code == 200
    assert calls == ["hello world"]


def test_tts_rejects_blank_and_missing_text(client):
    blank = client.post("/api/tts", json={"text": "   "})
    missing = client.post("/api/tts", json={})
    cache_missing = client.get("/api/tts/cache")

    assert blank.status_code == 400
    assert blank.json()["error"] == "text must not be empty"
    assert missing.status_code == 422
    assert missing.json()["error"] == "validation failed"
    assert cache_missing.status_code == 400
    assert cache_missing.json()["error"] == "text query required"


def test_tts_missing_provider_key_maps_to_500(client, monkeypatch):
    monkeypatch.setattr(tts_router, "get_cached_audio", lambda *_args: None)

    def no_client():
        raise HTTPException(
            status_code=500,
            detail="ELEVENLABS_API_KEY not configured",
        )

    monkeypatch.setattr(tts_router, "get_eleven_client", no_client)
    response = client.post("/api/tts", json={"text": "hello"})

    assert response.status_code == 500
    assert response.json()["error"] == "ELEVENLABS_API_KEY not configured"


def test_tts_cached_response_and_alias_headers(client, monkeypatch, tmp_path):
    audio = tmp_path / "cached.mp3"
    audio.write_bytes(b"cached-audio")
    monkeypatch.setattr(tts_router, "get_cached_audio", lambda *_args: audio)

    for path in ("/api/tts", "/tts"):
        response = client.post(path, json={"text": "hello"})
        assert response.status_code == 200
        assert response.content == b"cached-audio"
        assert response.headers["content-type"] == "audio/mpeg"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-tts-cached"] == "1"
        assert response.headers["x-voice-id"] == "cgSgspJ2msm6clMCkdW9"
        assert response.headers["x-model-id"] == "eleven_v3"


def test_tts_streaming_response_preserves_defaults(client, monkeypatch):
    monkeypatch.setattr(tts_router, "get_cached_audio", lambda *_args: None)
    monkeypatch.setattr(tts_router, "get_eleven_client", lambda: object())
    monkeypatch.setattr(
        tts_router,
        "synthesize_stream",
        lambda voice_id, model_id, text: iter([b"one", b"two"]),
    )

    response = client.post("/api/tts", json={"text": "hello"})

    assert response.status_code == 200
    assert response.content == b"onetwo"
    assert response.headers["x-tts-cached"] == "0"
    assert response.headers["x-voice-id"] == "cgSgspJ2msm6clMCkdW9"
    assert response.headers["x-model-id"] == "eleven_v3"


def test_tts_cache_hit_miss_and_query_aliases(client, monkeypatch, tmp_path):
    monkeypatch.setattr(tts_router, "get_cached_audio", lambda *_args: None)
    missing = client.get("/api/tts/cache", params={"text": "hello"})
    assert missing.status_code == 404
    assert missing.json()["error"] == "not cached"

    audio = tmp_path / "cached.mp3"
    audio.write_bytes(b"cache")
    calls = []

    def cached(voice_id, model_id, text):
        calls.append((voice_id, model_id, text))
        return Path(audio)

    monkeypatch.setattr(tts_router, "get_cached_audio", cached)
    response = client.get(
        "/api/tts/cache",
        params={"voice_id": "voice", "model_id": "model", "text": "hello"},
    )

    assert response.status_code == 200
    assert response.content == b"cache"
    assert response.headers["x-tts-cached"] == "1"
    assert calls == [("voice", "model", "hello")]


def test_prosody_heuristic_contract_and_permissive_body(client):
    expected = {
        "labels": [],
        "features": {
            "f0Mean": 181.2,
            "f0Range": 38.5,
            "energy": -31.4,
            "speechRate": 3.9,
        },
        "confidence": 0.42,
    }

    assert client.post("/api/prosody", json={}).json() == expected
    response = client.post(
        "/api/prosody",
        json={"text": "hello", "audio_b64": "not-validated", "ignored": True},
    )
    assert response.status_code == 200
    assert response.json() == expected


def test_prosody_health_shape(client):
    response = client.get("/api/prosody/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert isinstance(payload["probe_found"], bool)
    assert payload["probe_path"].endswith("prosody/weights/probe.pt")
