#!/usr/bin/env bash
set -euo pipefail

# Run the full local dev stack (backend + Vite) so the Vite /ws and /api
# proxy always has a listener and never surfaces AggregateError ECONNREFUSED.
#
# Usage:
#   dev-stack.sh real [extra vite args...]
#   dev-stack.sh mock [extra vite args...]
#
# Env overrides (all optional, match apps/web/vite.config.ts):
#   API_PORT  FastAPI port; defaults to 8000
#   MOCK_PORT mock server port; defaults to 8787
#   HOST      backend bind host; defaults to 127.0.0.1
#   TTS_PORT  TTS proxy port; defaults to API_PORT (passed through to Vite)

mode="${1:-real}"
if [[ "${mode}" == -* ]]; then
  # Called as `dev-stack.sh -- --port 5174`: default to real backend.
  set -- real "$@"
  mode="real"
else
  shift || true
fi
if [[ "${mode}" != "real" && "${mode}" != "mock" ]]; then
  echo "usage: dev-stack.sh [real|mock] [-- vite args...]" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
api_dir="${repo_root}/api"
web_dir="${repo_root}/apps/web"

API_PORT="${API_PORT:-8000}"
MOCK_PORT="${MOCK_PORT:-8787}"
HOST="${HOST:-127.0.0.1}"
TIMEOUT_SECS="${DEV_STACK_TIMEOUT_SECS:-30}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[dev-stack] missing required command: $1" >&2
    exit 127
  fi
}
need_cmd node
need_cmd npm
need_cmd curl
if [[ "${mode}" == "real" ]]; then
  need_cmd uv
fi

log() {
  echo "[dev-stack] $*"
}

port_taken() {
  # True (0) when something answers HTTP on HOST:PORT, even with a 404.
  # The standalone mock has no health route and answers 404; that still
  # counts as "listening". curl exit 7 means connection refused (free).
  curl -s -o /dev/null --max-time 1 "http://${HOST}:$1/" >/dev/null 2>&1
}

die_port_in_use() {
  local port="$1" owner="$2"
  echo "[dev-stack] port ${port} is already in use (${owner})." >&2
  echo "[dev-stack] stop that process or re-run with a free port, e.g.:" >&2
  if [[ "${owner}" == "api" ]]; then
    echo "  API_PORT=8001 just run-dev" >&2
  else
    echo "  MOCK_PORT=8788 just run-dev-mock" >&2
  fi
  exit 1
}

wait_for_api() {
  local i
  for ((i = 0; i < TIMEOUT_SECS * 2; i++)); do
    if curl -sf --max-time 1 "http://${HOST}:${API_PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

wait_for_mock() {
  local i
  for ((i = 0; i < TIMEOUT_SECS * 2; i++)); do
    if port_taken "${MOCK_PORT}"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

cleanup() {
  # Kill background jobs started by this shell (backend, mock, vite).
  local pids
  pids="$(jobs -p 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
  fi
}

# Sync Python deps only when the lockfile is newer than the venv (or missing).
if [[ "${mode}" == "real" ]]; then
  if [[ ! -d "${api_dir}/.venv" || "${api_dir}/uv.lock" -nt "${api_dir}/.venv" ]]; then
    log "syncing backend (uv sync --locked)"
    (cd "${api_dir}" && uv sync --locked)
  fi
fi

# Install frontend deps only when node_modules is missing or stale.
if [[ ! -d "${web_dir}/node_modules" || "${web_dir}/package-lock.json" -nt "${web_dir}/node_modules" ]]; then
  log "installing frontend (npm install)"
  (cd "${web_dir}" && npm install)
fi

log_dir_real="${api_dir}/.cache/dev"
log_dir_web="${web_dir}/.cache/dev"
mkdir -p "${log_dir_real}" "${log_dir_web}"

if [[ "${mode}" == "real" ]]; then
  if port_taken "${API_PORT}"; then
    die_port_in_use "${API_PORT}" "api"
  fi
  api_log="${log_dir_real}/api.log"
  web_log="${log_dir_web}/web.log"
  log "mode=real api=http://${HOST}:${API_PORT} vite=http://localhost:5173 logs=${api_log},${web_log}"
  log "starting backend (uvicorn prosody_api.app:app --reload)"
  (cd "${api_dir}" && exec uv run uvicorn prosody_api.app:app --reload --host "${HOST}" --port "${API_PORT}") >>"${api_log}" 2>&1 &
  log "waiting for backend /api/health (up to ${TIMEOUT_SECS}s) before starting Vite"
  if ! wait_for_api; then
    echo "[dev-stack] backend did not become healthy; last log lines:" >&2
    tail -n 20 "${api_log}" >&2 || true
    cleanup
    exit 1
  fi
  log "backend healthy; starting Vite"
  trap cleanup INT TERM
  (cd "${web_dir}" && exec npm run dev -- "$@") >>"${web_log}" 2>&1 &
  log "running; Ctrl-C stops both (tail logs: tail -f ${api_log} ${web_log})"
  wait
else
  if port_taken "${MOCK_PORT}"; then
    die_port_in_use "${MOCK_PORT}" "mock"
  fi
  mock_log="${log_dir_web}/mock.log"
  web_log="${log_dir_web}/web.log"
  log "mode=mock mock=http://${HOST}:${MOCK_PORT} vite=http://localhost:5173 logs=${mock_log},${web_log}"
  log "starting standalone mock (node mock/server.mjs)"
  (cd "${web_dir}" && MOCK_PORT="${MOCK_PORT}" exec node mock/server.mjs) >>"${mock_log}" 2>&1 &
  log "waiting for mock port ${MOCK_PORT} (up to ${TIMEOUT_SECS}s) before starting Vite"
  if ! wait_for_mock; then
    echo "[dev-stack] mock did not start; last log lines:" >&2
    tail -n 20 "${mock_log}" >&2 || true
    cleanup
    exit 1
  fi
  log "mock listening; starting Vite with USE_MOCK=1 NO_MOCK=1"
  trap cleanup INT TERM
  (cd "${web_dir}" && USE_MOCK=1 NO_MOCK=1 MOCK_PORT="${MOCK_PORT}" API_PORT="${API_PORT}" exec npm run dev -- "$@") >>"${web_log}" 2>&1 &
  log "running; Ctrl-C stops all (tail logs: tail -f ${mock_log} ${web_log})"
  wait
fi
