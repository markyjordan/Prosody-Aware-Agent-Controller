import asyncio
from dataclasses import dataclass

from elevenlabs.client import ElevenLabs
from elevenlabs.realtime.connection import RealtimeEvents
from elevenlabs.realtime.scribe import AudioFormat, CommitStrategy

from ..ports import ASRSessionPort, PartialTranscriptHandler


def _event_text(data: dict) -> str:
    return str(data.get("text") or data.get("transcript") or "").strip()


class ElevenLabsASRSession:
    def __init__(self, connection, on_partial: PartialTranscriptHandler):
        self.connection = connection
        self.on_partial = on_partial
        self._loop = asyncio.get_running_loop()
        self._committed: asyncio.Future[str] | None = None
        self._error: Exception | None = None
        connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, self._partial)
        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, self._final)
        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS, self._final)
        connection.on(RealtimeEvents.ERROR, self._failed)

    def _partial(self, data: dict) -> None:
        text = _event_text(data)
        if text:
            self._loop.create_task(self.on_partial(text))

    def _final(self, data: dict) -> None:
        if self._committed and not self._committed.done():
            self._committed.set_result(_event_text(data))

    def _failed(self, data: dict) -> None:
        message = data.get("error") or data.get("message") or "ElevenLabs ASR failed"
        self._error = RuntimeError(str(message))
        if self._committed and not self._committed.done():
            self._committed.set_exception(self._error)

    async def send(self, audio_b64: str) -> None:
        if self._error:
            raise self._error
        await self.connection.send({"audio_base_64": audio_b64})

    async def commit(self) -> str:
        if self._error:
            raise self._error
        self._committed = self._loop.create_future()
        await self.connection.commit()
        return await asyncio.wait_for(self._committed, timeout=10.0)

    async def close(self) -> None:
        await self.connection.close()


@dataclass(frozen=True)
class ElevenLabsASRProvider:
    api_key: str
    model_id: str = "scribe_v2_realtime"

    async def open(self, on_partial: PartialTranscriptHandler) -> ASRSessionPort:
        client = ElevenLabs(api_key=self.api_key)
        connection = await client.speech_to_text.realtime.connect(
            {
                "model_id": self.model_id,
                "audio_format": AudioFormat.PCM_16000,
                "sample_rate": 16000,
                "commit_strategy": CommitStrategy.MANUAL,
            }
        )
        return ElevenLabsASRSession(connection, on_partial)


class MockASRSession:
    def __init__(self, on_partial: PartialTranscriptHandler):
        self.on_partial = on_partial
        self.chunks = 0

    async def send(self, _audio_b64: str) -> None:
        self.chunks += 1
        if self.chunks == 2:
            await self.on_partial("Sure")

    async def commit(self) -> str:
        if not self.chunks:
            raise ValueError("utterance contained no audio")
        self.chunks = 0
        return "Sure."

    async def close(self) -> None:
        return None


class MockASRProvider:
    async def open(self, on_partial: PartialTranscriptHandler) -> ASRSessionPort:
        return MockASRSession(on_partial)


def provider_from_settings(settings) -> ElevenLabsASRProvider | MockASRProvider:
    if settings.elevenlabs_api_key:
        return ElevenLabsASRProvider(
            settings.elevenlabs_api_key,
            settings.asr_model,
        )
    return MockASRProvider()
