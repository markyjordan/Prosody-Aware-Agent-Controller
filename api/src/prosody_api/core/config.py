import os
from pathlib import Path
from functools import lru_cache

from dotenv import load_dotenv

api_dir = Path(__file__).resolve().parents[3]  # core -> prosody_api -> src -> api
repo_root = api_dir.parent

# canonical api/.env, plus repo root .env.local / .env for compat with snippet
load_dotenv(dotenv_path=api_dir / ".env")
load_dotenv(dotenv_path=repo_root / ".env.local")
load_dotenv(dotenv_path=repo_root / ".env")
# also load api/.env.local if present
load_dotenv(dotenv_path=api_dir / ".env.local")


def _clean(v: str | None) -> str | None:
    if not v:
        return None
    return v.strip().strip('"').strip("'").strip()


@lru_cache(maxsize=1)
def get_settings():
    return {
        "elevenlabs_api_key": _clean(os.getenv("ELEVENLABS_API_KEY")),
        "openai_api_key": _clean(os.getenv("OPENAI_API_KEY")),
        "voice_id": _clean(os.getenv("ELEVENLABS_VOICE_ID")) or "cgSgspJ2msm6clMCkdW9",
        "model_id": _clean(os.getenv("ELEVENLABS_MODEL_ID")) or "eleven_v3",
        "openai_model": _clean(os.getenv("OPENAI_MODEL")) or "gpt-4o-mini",
        "probe_path": Path(_clean(os.getenv("PROBE_PATH")) or str(api_dir / "src" / "prosody_api" / "prosody" / "weights" / "probe.pt")),
        "cache_dir": Path(_clean(os.getenv("TTS_CACHE_DIR")) or str(api_dir / ".cache" / "tts")),
    }
