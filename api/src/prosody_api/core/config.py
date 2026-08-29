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


@dataclass(frozen=True)
class Settings:
    elevenlabs_api_key: str | None
    openai_api_key: str | None
    voice_id: str
    model_id: str
    openai_model: str
    probe_path: Path
    cache_dir: Path
    auth_enabled: bool
    auth_api_key: str | None
    rate_limit_enabled: bool
    rate_limit: int
    rate_window: int

    @classmethod
    def from_environment(cls) -> "Settings":
        elevenlabs_api_key = _clean(os.getenv("ELEVENLABS_API_KEY"))
        return cls(
            elevenlabs_api_key=elevenlabs_api_key,
            openai_api_key=_clean(os.getenv("OPENAI_API_KEY")),
            voice_id=_clean(os.getenv("ELEVENLABS_VOICE_ID"))
            or "cgSgspJ2msm6clMCkdW9",
            model_id=_clean(os.getenv("ELEVENLABS_MODEL_ID")) or "eleven_v3",
            openai_model=_clean(os.getenv("OPENAI_MODEL")) or "gpt-4o-mini",
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
        )

    def __getitem__(self, key: str) -> Any:
        """Retain read-only mapping access for existing service callers."""
        return getattr(self, key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_environment()
