#!/usr/bin/env bash
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly ENV_NAME="${MGC_ENV_NAME:-music-genre-classifier}"
readonly CONDARC_PATH="${MGC_CONDARC:-${CONDARC:-${XDG_CONFIG_HOME:-$HOME/.config}/conda/.condarc}}"

if ! command -v mamba >/dev/null 2>&1; then
  echo "error: mamba is required. Install Miniforge, then retry." >&2
  exit 1
fi

if env CONDARC="${CONDARC_PATH}" mamba env list | awk '{print $1}' | grep -qx "${ENV_NAME}"; then
  env CONDARC="${CONDARC_PATH}" mamba env update -n "${ENV_NAME}" -f "${REPO_ROOT}/environment.yml" --prune
else
  env CONDARC="${CONDARC_PATH}" mamba env create -n "${ENV_NAME}" -f "${REPO_ROOT}/environment.yml"
fi

cat <<MSG

Environment '${ENV_NAME}' is ready.

Run this in your shell to activate it:
  eval "\$(mamba shell hook --shell zsh)"
  mamba activate ${ENV_NAME}

Or run commands without activation through:
  mamba run -n ${ENV_NAME} <command>
MSG
