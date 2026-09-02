from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from pathlib import Path
from typing import Protocol

from .schemas import Prosody, ProsodyRequest


class LLMPort(Protocol):
    def stream(self, prompt: str) -> AsyncIterator[str]: ...


ConditionPromptBuilder = Callable[[str, Prosody | None], tuple[str, str]]


class AudioCachePort(Protocol):
    def get(self, voice_id: str, model_id: str, text: str) -> Path | None: ...

    def save(self, voice_id: str, model_id: str, text: str, data: bytes) -> Path: ...


class TTSProviderPort(Protocol):
    def stream(self, voice_id: str, model_id: str, text: str) -> Iterator[bytes]: ...


class TTSServicePort(Protocol):
    def get_cached_audio(
        self, voice_id: str, model_id: str, text: str
    ) -> Path | None: ...

    def synthesize_stream(
        self, voice_id: str, model_id: str, text: str
    ) -> Iterator[bytes]: ...

    def prefetch(
        self,
        text: str,
        voice_id: str | None = None,
        model_id: str | None = None,
    ) -> None: ...


class ProsodyPredictorPort(Protocol):
    def predict(self, request: ProsodyRequest) -> Prosody: ...


PartialTranscriptHandler = Callable[[str], Awaitable[None]]


class ASRSessionPort(Protocol):
    async def send(self, audio_b64: str) -> None: ...

    async def commit(self) -> str: ...

    async def close(self) -> None: ...


class ASRProviderPort(Protocol):
    async def open(
        self, on_partial: PartialTranscriptHandler
    ) -> ASRSessionPort: ...


class LatencySinkPort(Protocol):
    def append(self, record: dict) -> None: ...
