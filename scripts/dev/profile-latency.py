#!/usr/bin/env python3
import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path


def percentile(values: list[float], percent: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(percent / 100 * len(ordered)) - 1)
    return ordered[index]


def summarize(label: str, records: list[dict]) -> None:
    stages: dict[str, list[float]] = defaultdict(list)
    for record in records:
        for stage, value in record.get("durations_ms", {}).items():
            if isinstance(value, (int, float)):
                stages[stage].append(float(value))

    print(f"{label}: {len(records)} records")
    for stage, values in sorted(stages.items()):
        print(
            f"  {stage:30} p50={percentile(values, 50):7.1f} "
            f"p95={percentile(values, 95):7.1f} max={max(values):7.1f} ms"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize voice latency JSONL")
    parser.add_argument(
        "path",
        nargs="?",
        type=Path,
        default=Path("api/.cache/latency/turns.jsonl"),
    )
    args = parser.parse_args()
    if not args.path.exists():
        print(f"no latency records found at {args.path}")
        return
    records = [
        json.loads(line)
        for line in args.path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    turns = [record for record in records if record.get("kind") == "turn"]
    tts = [record for record in records if record.get("kind") == "tts"]
    warm = [record for record in turns if not record.get("cold")]
    cold = [record for record in turns if record.get("cold")]

    summarize("turns", turns)
    summarize("warm turns", warm)
    summarize("cold turns", cold)
    summarize("tts", tts)

    outcomes = Counter(record.get("outcome", "unknown") for record in turns)
    failures = sum(count for key, count in outcomes.items() if key != "ok")
    print(f"outcomes: {dict(outcomes)}; failure_rate={failures / max(1, len(turns)):.1%}")

    first_text = [
        record.get("durations_ms", {}).get("release_to_first_text")
        for record in warm
    ]
    measured = [float(value) for value in first_text if isinstance(value, (int, float))]
    if measured:
        passes = sum(value <= 1500 for value in measured)
        print(
            f"warm release-to-first-text SLO <=1500 ms: "
            f"{passes}/{len(measured)} ({passes / len(measured):.1%})"
        )

    models = Counter(
        (
            record.get("providers", {}).get("asr_model"),
            record.get("providers", {}).get("llm_model"),
        )
        for record in turns
    )
    print(f"provider models: {dict(models)}")


if __name__ == "__main__":
    main()
