ci:
	./scripts/ci/test-api.sh

profile-latency path="api/.cache/latency/turns.jsonl":
	python3 scripts/dev/profile-latency.py {{path}}
