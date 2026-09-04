import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


api_dir = Path(__file__).resolve().parents[3]
repo_root = api_dir.parent

# Preserve the established first-value-wins dotenv precedence.
load_dotenv(dotenv_path=api_dir / ".env")
load_dotenv(dotenv_path=repo_root / ".env.local")
load_dotenv(dotenv_path=repo_root / ".env")
load_dotenv(dotenv_path=api_dir / ".env.local")


def _clean(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().strip('"').strip("'").strip()


def _optional_path(value: str | None, default: Path) -> Path | None:
    cleaned = _clean(value)
    if cleaned and cleaned.lower() in {"off", "none", "disabled"}:
        return None
    return Path(cleaned) if cleaned else default


@dataclass(frozen=True)
class Settings:
    elevenlabs_api_key: str | None
    groq_api_key: str | None
    voice_id: str
    model_id: str
    groq_model: str
    probe_path: Path
    cache_dir: Path
    auth_enabled: bool
    auth_api_key: str | None
    rate_limit_enabled: bool
    rate_limit: int
    rate_window: int
    asr_model: str = "scribe_v2_realtime"
    groq_reasoning_effort: str = "default"
    groq_max_completion_tokens: int = 2048
    groq_temperature: float = 0.6
    groq_top_p: float = 0.95
    latency_profile_path: Path | None = None
    prosody_timeout_seconds: float = 2.0

    @classmethod
    def from_environment(cls) -> "Settings":
        elevenlabs_api_key = _clean(os.getenv("ELEVENLABS_API_KEY"))
        return cls(
            elevenlabs_api_key=elevenlabs_api_key,
            groq_api_key=_clean(os.getenv("GROQ_API_KEY")),
            voice_id=_clean(os.getenv("ELEVENLABS_VOICE_ID"))
            or "cgSgspJ2msm6clMCkdW9",
            model_id=_clean(os.getenv("ELEVENLABS_MODEL_ID")) or "eleven_v3",
            groq_model=_clean(os.getenv("GROQ_MODEL")) or "qwen/qwen3.8-27b",
            probe_path=Path(
                _clean(os.getenv("PROBE_PATH"))
                or api_dir / "src" / "prosody_api" / "prosody" / "weights" / "probe.pt"
            ),
            cache_dir=Path(
                _clean(os.getenv("TTS_CACHE_DIR")) or api_dir / ".cache" / "tts"
            ),
            auth_enabled=os.getenv("AUTH_ENABLED", "0") in ("1", "true", "True"),
            auth_api_key=(
                _clean(os.getenv("AUTH_API_KEY"))
                or _clean(os.getenv("API_KEY"))
                or elevenlabs_api_key
            ),
            rate_limit_enabled=os.getenv("RATE_LIMIT_ENABLED", "1")
            not in ("0", "false", "False"),
            rate_limit=int(os.getenv("RATE_LIMIT", "60")),
            rate_window=int(os.getenv("RATE_WINDOW", "60")),
            asr_model=_clean(os.getenv("ELEVENLABS_ASR_MODEL"))
            or "scribe_v2_realtime",
            groq_reasoning_effort=_clean(os.getenv("GROQ_REASONING_EFFORT"))
            or "default",
            groq_max_completion_tokens=int(
                os.getenv("GROQ_MAX_COMPLETION_TOKENS", "2048")
            ),
            groq_temperature=float(os.getenv("GROQ_TEMPERATURE", "0.6")),
            groq_top_p=float(os.getenv("GROQ_TOP_P", "0.95")),
            latency_profile_path=_optional_path(
                os.getenv("LATENCY_PROFILE_PATH"),
                api_dir / ".cache" / "latency" / "turns.jsonl",
            ),
            prosody_timeout_seconds=float(os.getenv("PROSODY_TIMEOUT_SECONDS", "2.0")),
        )

    def __getitem__(self, key: str) -> Any:
        """Retain read-only mapping access for existing service callers."""
        return getattr(self, key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_environment()
