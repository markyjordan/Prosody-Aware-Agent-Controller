import hashlib
import os
from pathlib import Path
from typing import Iterator

from fastapi import HTTPException
from elevenlabs.client import ElevenLabs

from ..core.config import get_settings


def _hash_key(voice_id: str, model_id: str, text: str) -> str:
    h = hashlib.sha256(f"{voice_id}:{model_id}:{text}".encode("utf-8")).hexdigest()
    return h


def _cache_path(voice_id: str, model_id: str, text: str) -> Path:
    settings = get_settings()
    cache_dir = Path(settings["cache_dir"])
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{_hash_key(voice_id, model_id, text)}.mp3"


def get_cached_audio(voice_id: str, model_id: str, text: str) -> Path | None:
    p = _cache_path(voice_id, model_id, text)
    return p if p.exists() and p.stat().st_size > 0 else None


def save_to_cache(voice_id: str, model_id: str, text: str, data: bytes) -> Path:
    p = _cache_path(voice_id, model_id, text)
    p.write_bytes(data)
    return p


def get_eleven_client() -> ElevenLabs:
    settings = get_settings()
    key = settings["elevenlabs_api_key"]
    if key:
        key = key.strip().strip('"').strip("'")
    if not key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")
    return ElevenLabs(api_key=key)


def synthesize_stream(voice_id: str, model_id: str, text: str) -> Iterator[bytes]:
    """
    Returns Iterator[bytes] from ElevenLabs.
    If cache hit, yields cached file in chunks.
    If miss, streams from ElevenLabs and caches in background (buffer then write).
    """
    cached = get_cached_audio(voice_id, model_id, text)
    if cached:
        # stream cached file
        def gen():
            with open(cached, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk
        return gen()

    client = get_eleven_client()
    try:
        audio_iter = client.text_to_speech.convert(voice_id=voice_id, model_id=model_id, text=text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs TTS failed: {e}")

    # wrap iterator to cache while streaming
    def caching_gen():
        bufs = []
        try:
            for chunk in audio_iter:
                if chunk:
                    bufs.append(chunk)
                    yield chunk
        finally:
            # write cache after stream completes (best-effort)
            if bufs:
                try:
                    Path(_cache_path(voice_id, model_id, text)).write_bytes(b"".join(bufs))
                except Exception:
                    pass

    return caching_gen()


def prefetch(text: str, voice_id: str | None = None, model_id: str | None = None) -> None:
    """Fire-and-forget pre-cache for play button latency. Call after LLM response.done."""
    settings = get_settings()
    vid = voice_id or settings["voice_id"]
    mid = model_id or settings["model_id"]
    if get_cached_audio(vid, mid, text):
        return
    try:
        # consume stream to fill cache
        for _ in synthesize_stream(vid, mid, text):
            pass
    except Exception:
        pass
