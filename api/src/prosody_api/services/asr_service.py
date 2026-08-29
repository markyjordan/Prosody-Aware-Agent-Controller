"""
ElevenLabs Scribe ASR stub — will be called from routers/audio.py WS.

For now, this is a placeholder that mimics streaming ASR.
Real implementation will call ElevenLabs scribe API with audio chunks.
Keep mock behavior for frontend UI work.
"""
from typing import AsyncIterator


async def transcribe_stream(audio_iter: AsyncIterator[bytes]) -> AsyncIterator[dict]:
    """Yield {type: asr.partial|asr.final, text, prosody?} — stub."""
    # TODO: integrate ElevenLabs Scribe
    # Example: client.speech_to_text.convert(file=audio, model_id="scribe_v1")
    yield {"type": "asr.partial", "text": "mock partial"}
    yield {"type": "asr.final", "text": "Sure.", "prosody": {"labels": ["uncertain"], "confidence": 0.42}}
