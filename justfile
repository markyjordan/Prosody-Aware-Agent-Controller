set positional-arguments

alias dev := run-dev
alias dev-mock := run-dev-mock

ci:
	./scripts/ci/test-api.sh

profile-latency path="api/.cache/latency/turns.jsonl":
	python3 scripts/dev/profile-latency.py {{path}}

# run FastAPI (:8000/API_PORT) + Vite; waits on /api/health so the proxy never ECONNREFUSED
run-dev *args:
	@bash "{{justfile_directory()}}/scripts/dev/justfile/dev-stack.sh" real "$@"

# run standalone mock (:8787/MOCK_PORT) + Vite (USE_MOCK=1 NO_MOCK=1); no keys needed
run-dev-mock *args:
	@bash "{{justfile_directory()}}/scripts/dev/justfile/dev-stack.sh" mock "$@"
