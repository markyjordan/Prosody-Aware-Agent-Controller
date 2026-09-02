import asyncio

from fastapi.testclient import TestClient

from prosody_api.app import create_app
from prosody_api.core.config import Settings
from prosody_api.core.dependencies import DependencyContainer
from prosody_api.schemas import Prosody


def settings(tmp_path):
    return Settings(
        elevenlabs_api_key=None,
        openai_api_key=None,
        voice_id="voice",
        model_id="eleven_flash_v2_5",
        openai_model="gpt-5.6-luna",
        probe_path=tmp_path / "probe.pt",
        cache_dir=tmp_path / "cache",
        auth_enabled=False,
        auth_api_key=None,
        rate_limit_enabled=False,
        rate_limit=60,
        rate_window=60,
        latency_profile_path=None,
    )


class FakeASRSession:
    def __init__(self, partial):
        self.partial = partial
        self.sent = []
        self.commits = 0
        self.closed = False

    async def send(self, data):
        self.sent.append(data)
        await self.partial("partial")

    async def commit(self):
        self.commits += 1
        return "Final transcript."

    async def close(self):
        self.closed = True


class FakeASRProvider:
    def __init__(self):
        self.session = None

    async def open(self, partial):
        self.session = FakeASRSession(partial)
        return self.session


class FakeProsody:
    def __init__(self, fail=False):
        self.fail = fail
        self.requests = []

    def predict(self, request):
        self.requests.append(request)
        if self.fail:
            raise RuntimeError("no prosody")
        return Prosody(labels=["uncertain"], confidence=0.8)


class ConcurrentLLM:
    def __init__(self):
        self.started = 0
        self.gate = asyncio.Event()
        self.prompts = []

    def stream(self, prompt):
        async def generate():
            self.prompts.append(prompt)
            self.started += 1
            if self.started == 2:
                self.gate.set()
            await asyncio.wait_for(self.gate.wait(), timeout=1)
            yield "conditioned" if "prosody policy" in prompt else "baseline"

        return generate()


class Sink:
    def __init__(self):
        self.records = []

    def append(self, record):
        self.records.append(record)


def collect_turn(websocket):
    events = []
    while True:
        event = websocket.receive_json()
        events.append(event)
        if event["type"] == "turn.profile":
            return events


def test_websocket_owns_full_parallel_turn_and_profile(tmp_path):
    asr = FakeASRProvider()
    prosody = FakeProsody()
    llm = ConcurrentLLM()
    sink = Sink()
    dependencies = DependencyContainer(
        settings=settings(tmp_path),
        request_id_provider=lambda: "session-1",
        asr=asr,
        prosody_predictor=prosody,
        llm=llm,
        latency_sink=sink,
    )

    with TestClient(create_app(dependencies=dependencies)) as client:
        with client.websocket_connect("/ws") as websocket:
            websocket.send_json(
                {
                    "type": "session.init",
                    "protocolVersion": 1,
                    "sampleRate": 16000,
                    "codec": "pcm16",
                    "scenario": "uncertain-yes",
                }
            )
            assert websocket.receive_json() == {
                "type": "session.ready",
                "sessionId": "session-1",
                "protocolVersion": 1,
            }
            websocket.send_json({"type": "utterance.begin", "turnId": "turn-1"})
            websocket.send_json(
                {
                    "type": "audio.delta",
                    "turnId": "turn-1",
                    "sequence": 0,
                    "data": "AAAAAA==",
                }
            )
            websocket.send_json({"type": "utterance.end", "turnId": "turn-1"})
            events = collect_turn(websocket)
            websocket.send_json({"type": "utterance.begin", "turnId": "turn-2"})
            websocket.send_json(
                {
                    "type": "audio.delta",
                    "turnId": "turn-2",
                    "sequence": 0,
                    "data": "AAAAAA==",
                }
            )
            websocket.send_json({"type": "utterance.end", "turnId": "turn-2"})
            collect_turn(websocket)

    types = [event["type"] for event in events]
    assert types[0] == "asr.partial"
    assert "prosody.update" in types
    assert "asr.final" in types
    assert types.count("response.done") == 2
    assert types[-1] == "turn.profile"
    assert {event.get("branch") for event in events if event["type"] == "response.delta"} == {
        "baseline",
        "prosodic",
    }
    assert asr.session.commits == 2
    assert asr.session.closed is True
    assert llm.started == 4
    assert any("prosody policy" in prompt for prompt in llm.prompts)
    assert sink.records[0]["turn_id"] == "turn-1"
    assert sink.records[0]["outcome"] == "ok"
    assert sink.records[0]["cold"] is True
    assert sink.records[1]["cold"] is False
    assert not {"audio", "transcript", "prompt", "response"}.intersection(
        sink.records[0]
    )
    baseline_second = next(
        prompt
        for prompt in llm.prompts[2:]
        if "prosody policy" not in prompt.split("Current user turn:")[-1]
    )
    prosodic_second = next(
        prompt
        for prompt in llm.prompts[2:]
        if "prosody policy" in prompt.split("Current user turn:")[-1]
    )
    assert "assistant: baseline" in baseline_second
    assert "assistant: conditioned" not in baseline_second
    assert "assistant: conditioned" in prosodic_second
    assert "assistant: baseline" not in prosodic_second


def test_websocket_rejects_empty_out_of_order_and_duplicate_turns(tmp_path):
    dependencies = DependencyContainer(
        settings=settings(tmp_path),
        asr=FakeASRProvider(),
        prosody_predictor=FakeProsody(),
        llm=ConcurrentLLM(),
        latency_sink=Sink(),
    )
    with TestClient(create_app(dependencies=dependencies)) as client:
        with client.websocket_connect("/ws") as websocket:
            websocket.send_json(
                {
                    "type": "session.init",
                    "protocolVersion": 1,
                    "sampleRate": 16000,
                    "codec": "pcm16",
                }
            )
            websocket.receive_json()
            websocket.send_json({"type": "utterance.begin", "turnId": "empty"})
            websocket.send_json({"type": "utterance.end", "turnId": "empty"})
            assert websocket.receive_json()["code"] == "empty_audio"
            assert websocket.receive_json()["type"] == "turn.profile"

            websocket.send_json({"type": "utterance.begin", "turnId": "ordered"})
            websocket.send_json(
                {
                    "type": "audio.delta",
                    "turnId": "ordered",
                    "sequence": 2,
                    "data": "AAAA",
                }
            )
            assert websocket.receive_json()["code"] == "out_of_order_audio"
            websocket.send_json({"type": "utterance.begin", "turnId": "ordered"})
            assert websocket.receive_json()["code"] == "duplicate_turn"

            websocket.send_json({"type": "utterance.begin", "turnId": "invalid"})
            websocket.send_json(
                {
                    "type": "audio.delta",
                    "turnId": "invalid",
                    "sequence": 0,
                    "data": "not-base64!",
                }
            )
            assert websocket.receive_json()["code"] == "audio_ingress_failed"


def test_prosody_failure_runs_baseline_and_marks_other_branch(tmp_path):
    llm = ConcurrentLLM()

    class OneBranchLLM:
        def stream(self, _prompt):
            async def generate():
                yield "baseline only"

            return generate()

    dependencies = DependencyContainer(
        settings=settings(tmp_path),
        asr=FakeASRProvider(),
        prosody_predictor=FakeProsody(fail=True),
        llm=OneBranchLLM(),
        latency_sink=Sink(),
    )
    with TestClient(create_app(dependencies=dependencies)) as client:
        with client.websocket_connect("/ws") as websocket:
            websocket.send_json(
                {
                    "type": "session.init",
                    "protocolVersion": 1,
                    "sampleRate": 16000,
                    "codec": "pcm16",
                }
            )
            websocket.receive_json()
            websocket.send_json({"type": "utterance.begin", "turnId": "turn"})
            websocket.send_json(
                {
                    "type": "audio.delta",
                    "turnId": "turn",
                    "sequence": 0,
                    "data": "AAAA",
                }
            )
            websocket.send_json({"type": "utterance.end", "turnId": "turn"})
            events = collect_turn(websocket)

    assert any(
        event["type"] == "error"
        and event.get("branch") == "prosodic"
        and event["code"] == "prosody_failed"
        for event in events
    )
    assert any(
        event["type"] == "response.done" and event["branch"] == "baseline"
        for event in events
    )
    assert not any(
        event["type"] == "response.done" and event["branch"] == "prosodic"
        for event in events
    )


def test_empty_policy_streams_fail_both_branches_without_hanging(tmp_path):
    class EmptyLLM:
        def stream(self, _prompt):
            async def generate():
                if False:
                    yield "unused"

            return generate()

    dependencies = DependencyContainer(
        settings=settings(tmp_path),
        asr=FakeASRProvider(),
        prosody_predictor=FakeProsody(),
        llm=EmptyLLM(),
        latency_sink=Sink(),
    )
    with TestClient(create_app(dependencies=dependencies)) as client:
        with client.websocket_connect("/ws") as websocket:
            websocket.send_json(
                {
                    "type": "session.init",
                    "protocolVersion": 1,
                    "sampleRate": 16000,
                    "codec": "pcm16",
                }
            )
            websocket.receive_json()
            websocket.send_json({"type": "utterance.begin", "turnId": "turn"})
            websocket.send_json(
                {
                    "type": "audio.delta",
                    "turnId": "turn",
                    "sequence": 0,
                    "data": "AAAA",
                }
            )
            websocket.send_json({"type": "utterance.end", "turnId": "turn"})
            events = collect_turn(websocket)

    failures = [
        event
        for event in events
        if event["type"] == "error" and event["code"] == "policy_failed"
    ]
    assert {event["branch"] for event in failures} == {"baseline", "prosodic"}
    assert all("no response text" in event["message"] for event in failures)
    assert events[-1]["profile"]["outcome"] == "partial"
