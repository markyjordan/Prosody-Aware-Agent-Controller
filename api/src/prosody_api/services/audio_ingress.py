"""
Audio Ingress — buffer/normalize PCM16 16k from frontend worklet.

Frontend sends base64 PCM16 chunks via WS audio.delta.
This service buffers and normalizes for ASR + prosody branches.
"""
from collections import deque


class AudioBuffer:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.chunks: deque[bytes] = deque()
        self.total_bytes = 0

    def push(self, b64_data: str):
        import base64

        raw = base64.b64decode(b64_data, validate=True)
        self.chunks.append(raw)
        self.total_bytes += len(raw)

    def clear(self):
        self.chunks.clear()
        self.total_bytes = 0

    def duration_secs(self) -> float:
        # PCM16 mono 16k → 2 bytes per sample
        return self.total_bytes / 2 / self.sample_rate

    def concat(self) -> bytes:
        return b"".join(self.chunks)
