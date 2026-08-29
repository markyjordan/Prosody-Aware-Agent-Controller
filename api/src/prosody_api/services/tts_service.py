import hashlib
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException
from elevenlabs.client import ElevenLabs

from ..core.config import get_settings
from ..ports import AudioCachePort, TTSProviderPort


def _hash_key(voice_id: str, model_id: str, text: str) -> str:
    h = hashlib.sha256(f"{voice_id}:{model_id}:{text}".encode("utf-8")).hexdigest()
    return h


def _cache_path(voice_id: str, model_id: str, text: str) -> Path:
    settings = get_settings()
    cache_dir = Path(settings["cache_dir"])
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{_hash_key(voice_id, model_id, text)}.mp3"


@dataclass(frozen=True)
class FileAudioCache:
    root: Path

    def path_for(self, voice_id: str, model_id: str, text: str) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        return self.root / f"{_hash_key(voice_id, model_id, text)}.mp3"

    def get(self, voice_id: str, model_id: str, text: str) -> Path | None:
        path = self.path_for(voice_id, model_id, text)
        return path if path.exists() and path.stat().st_size > 0 else None

    def save(self, voice_id: str, model_id: str, text: str, data: bytes) -> Path:
        path = self.path_for(voice_id, model_id, text)
        path.write_bytes(data)
        return path


@dataclass(frozen=True)
class ElevenLabsTTSProvider:
    client_factory: Callable[[], ElevenLabs]

    def stream(self, voice_id: str, model_id: str, text: str) -> Iterator[bytes]:
        try:
            return self.client_factory().text_to_speech.convert(
                voice_id=voice_id,
                model_id=model_id,
                text=text,
            )
        except Exception as error:
            raise HTTPException(
                status_code=502,
                detail=f"ElevenLabs TTS failed: {error}",
            ) from error


@dataclass(frozen=True)
class StreamingTTSSynthesizer:
    cache: AudioCachePort
    provider: TTSProviderPort

    def stream(self, voice_id: str, model_id: str, text: str) -> Iterator[bytes]:
        cached = self.cache.get(voice_id, model_id, text)
        if cached:
            def cached_chunks():
                with cached.open("rb") as audio_file:
                    while chunk := audio_file.read(8192):
                        yield chunk

            return cached_chunks()

        audio = self.provider.stream(voice_id, model_id, text)

        def caching_stream():
            chunks = []
            try:
                for chunk in audio:
                    if chunk:
                        chunks.append(chunk)
                        yield chunk
            finally:
                if chunks:
                    try:
                        self.cache.save(voice_id, model_id, text, b"".join(chunks))
                    except Exception:
                        pass

        return caching_stream()


@dataclass(frozen=True)
class TTSPrefetcher:
    cache: AudioCachePort
    synthesizer: StreamingTTSSynthesizer
    default_voice_id: str
    default_model_id: str

    def prefetch(
        self,
        text: str,
        voice_id: str | None = None,
        model_id: str | None = None,
    ) -> None:
        resolved_voice = voice_id or self.default_voice_id
        resolved_model = model_id or self.default_model_id
        if self.cache.get(resolved_voice, resolved_model, text):
            return
        try:
            for _ in self.synthesizer.stream(resolved_voice, resolved_model, text):
                pass
        except Exception:
            pass


@dataclass(frozen=True)
class TTSService:
    cache: AudioCachePort
    synthesizer: StreamingTTSSynthesizer
    prefetcher: TTSPrefetcher

    def get_cached_audio(
        self, voice_id: str, model_id: str, text: str
    ) -> Path | None:
        return self.cache.get(voice_id, model_id, text)

    def synthesize_stream(
        self, voice_id: str, model_id: str, text: str
    ) -> Iterator[bytes]:
        return self.synthesizer.stream(voice_id, model_id, text)

    def prefetch(
        self,
        text: str,
        voice_id: str | None = None,
        model_id: str | None = None,
    ) -> None:
        self.prefetcher.prefetch(text, voice_id, model_id)


def get_cached_audio(voice_id: str, model_id: str, text: str) -> Path | None:
    settings = get_settings()
    return FileAudioCache(Path(settings["cache_dir"])).get(voice_id, model_id, text)


def save_to_cache(voice_id: str, model_id: str, text: str, data: bytes) -> Path:
    settings = get_settings()
    return FileAudioCache(Path(settings["cache_dir"])).save(
        voice_id, model_id, text, data
    )


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
    settings = get_settings()
    cache = FileAudioCache(Path(settings["cache_dir"]))
    provider = ElevenLabsTTSProvider(get_eleven_client)
    return StreamingTTSSynthesizer(cache, provider).stream(voice_id, model_id, text)


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
