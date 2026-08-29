"""
Utterance Aggregator — joins streaming ASR + prosody pipeline into one utterance.

Diagram:
  partial transcript + acoustic state → final transcript + final prosody → aggregator → {transcript, prosody}
"""
from typing import Optional
from ..schemas import Prosody


class UtteranceAggregator:
    def __init__(self):
        self.partial_text: str = ""
        self.final_text: Optional[str] = None
        self.prosody: Optional[Prosody] = None
        self._text_done = False
        self._prosody_done = False

    def on_partial(self, text: str):
        self.partial_text = text

    def on_prosody(self, p: Prosody):
        self.prosody = p
        self._prosody_done = True

    def on_final(self, text: str, prosody: Prosody):
        self.final_text = text
        self.prosody = prosody
        self._text_done = True

    def ready(self) -> bool:
        return self._text_done and self._prosody_done

    def utterance(self) -> dict:
        if not self.final_text or not self.prosody:
            raise ValueError("incomplete utterance")
        return {"transcript": self.final_text, "prosody": self.prosody}
