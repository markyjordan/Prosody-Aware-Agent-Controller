#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
api_dir="${repo_root}/api"

export API_KEY=""
export AUTH_API_KEY=""
export AUTH_ENABLED="0"
export ELEVENLABS_API_KEY=""
export OPENAI_API_KEY=""

cd "${api_dir}"
exec uv run --locked pytest -q \
  --cov=prosody_api \
  --cov-report=term-missing \
  --cov-fail-under=90
