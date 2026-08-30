#!/usr/bin/env bash
set -euo pipefail

readonly RESEARCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly DEFAULT_ENV_NAME="prosody-controller"
readonly ENV_NAME="${PROSODY_RESEARCH_ENV_NAME:-${DEFAULT_ENV_NAME}}"
readonly CONDARC_PATH="${PROSODY_RESEARCH_CONDARC:-${CONDARC:-${XDG_CONFIG_HOME:-$HOME/.config}/conda/.condarc}}"
readonly ENVIRONMENT_FILE="${RESEARCH_ROOT}/environment.yml"

print_usage() {
  printf '%s\n' \
    "usage: ml.sh <command> [args...]" \
    "" \
    "commands:" \
    "  bootstrap    Create the environment, or update it with pruning." \
    "  update-env   Update an existing environment with pruning." \
    "  remove-env   Remove the environment if it exists." \
    "  env-check    Run dependency and device smoke checks." \
    "  activate     Print shell activation instructions." \
    "  deactivate   Print the shell deactivation instruction." \
    "  run          Run the remaining command inside the environment."
}

require_mamba() {
  if ! command -v mamba >/dev/null 2>&1; then
    echo "error: mamba is required. Install Miniforge, then retry." >&2
    exit 1
  fi
}

environment_exists() {
  env CONDARC="${CONDARC_PATH}" mamba env list | awk '{print $1}' | grep -Fxq "${ENV_NAME}"
}

require_environment() {
  if ! environment_exists; then
    echo "error: Mamba environment '${ENV_NAME}' does not exist." >&2
    echo "help: run 'just bootstrap' from ${RESEARCH_ROOT}." >&2
    exit 1
  fi
}

create_environment() {
  env CONDARC="${CONDARC_PATH}" mamba env create \
    -n "${ENV_NAME}" \
    -f "${ENVIRONMENT_FILE}" \
    --yes
}

update_environment() {
  env CONDARC="${CONDARC_PATH}" mamba env update \
    -n "${ENV_NAME}" \
    -f "${ENVIRONMENT_FILE}" \
    --prune \
    --yes
}

bootstrap() {
  if environment_exists; then
    update_environment
  else
    create_environment
  fi

  printf '\nEnvironment %q is ready.\n' "${ENV_NAME}"
  print_activation
}

remove_environment() {
  if ! environment_exists; then
    printf 'Environment %q does not exist; nothing to remove.\n' "${ENV_NAME}"
    return
  fi

  env CONDARC="${CONDARC_PATH}" mamba env remove -n "${ENV_NAME}" --yes
}

print_activation() {
  cat <<MSG
Run this in your shell to activate it:
  eval "\$(mamba shell hook --shell zsh)"
  mamba activate ${ENV_NAME}
MSG
}

print_deactivation() {
  printf '%s\n' "Run this in your shell to deactivate it:" "  mamba deactivate"
}

run_in_environment() {
  require_environment
  env CONDARC="${CONDARC_PATH}" mamba run -n "${ENV_NAME}" "$@"
}

check_environment() {
  run_in_environment python -c '
import datasets
import torch
import torchaudio
import torchcodec

waveform = torch.zeros(1, 16_000)
mel = torchaudio.transforms.MelSpectrogram(sample_rate=16_000, n_mels=64)(waveform)
assert mel.ndim == 3

print(f"python/torch: {torch.__version__}")
print(f"torchaudio: {torchaudio.__version__}")
print(f"torchcodec: {torchcodec.__version__}")
print(f"datasets: {datasets.__version__}")
print(f"mel shape: {tuple(mel.shape)}")
print(f"mps available: {bool(hasattr(torch.backends, '"'"'mps'"'"') and torch.backends.mps.is_available())}")
print(f"cuda available: {torch.cuda.is_available()}")
print("cpu available: True")
'
  run_in_environment jupyter lab --version
  run_in_environment tensorboard --version
}

main() {
  require_mamba

  local command="${1:-}"
  if [[ -z "${command}" ]]; then
    print_usage >&2
    exit 2
  fi
  shift

  case "${command}" in
    bootstrap)
      bootstrap
      ;;
    update-env)
      require_environment
      update_environment
      ;;
    remove-env)
      remove_environment
      ;;
    env-check)
      check_environment
      ;;
    activate)
      print_activation
      ;;
    deactivate)
      print_deactivation
      ;;
    run)
      if [[ "$#" -eq 0 ]]; then
        echo "error: run requires a command." >&2
        exit 2
      fi
      run_in_environment "$@"
      ;;
    -h|--help|help)
      print_usage
      ;;
    *)
      echo "error: unknown command '${command}'." >&2
      print_usage >&2
      exit 2
      ;;
  esac
}

main "$@"
