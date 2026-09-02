import json

from prosody_api.services.latency import JsonlLatencySink, TurnTrace


class Clock:
    def __init__(self):
        self.value = 1.0

    def __call__(self):
        value = self.value
        self.value += 0.125
        return value


def test_turn_trace_uses_one_monotonic_clock_domain():
    trace = TurnTrace("session", "turn", "scenario", Clock())
    trace.mark("start")
    trace.mark("end")
    trace.mark("end")

    assert trace.ms("start", "end") == 125.0
    assert trace.ms("missing", "end") is None
    assert trace.offsets_ms() == {"start": 125.0, "end": 250.0}


def test_jsonl_sink_is_content_agnostic_and_optional(tmp_path):
    path = tmp_path / "nested" / "latency.jsonl"
    sink = JsonlLatencySink(path)
    sink.append({"kind": "turn", "turn_id": "one", "durations_ms": {"asr": 1}})
    sink.append({"kind": "tts", "turn_id": "one", "cached": False})

    records = [json.loads(line) for line in path.read_text().splitlines()]
    assert [record["kind"] for record in records] == ["turn", "tts"]
    assert JsonlLatencySink(None).append({"ignored": True}) is None
