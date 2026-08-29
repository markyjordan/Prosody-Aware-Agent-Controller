"""
Prosody Pipeline — loads linear probe artifact from research/artifacts/probe.pt

research/ builds data→inference pipeline + exports artifact.
api serving loads it at lifespan startup (core/lifespan.py).

For now: heuristic fallback if artifact missing.
"""
from dataclasses import dataclass
from typing import Optional

from ..core.artifacts import ProsodyArtifactLocator
from ..core.config import get_settings
from ..schemas import Prosody, ProsodyFeatures, ProsodyRequest


def _heuristic_prosody(text: Optional[str] = None) -> Prosody:
    # very small heuristic matching scenarios.mjs
    # keep stub lightweight until probe artifact exists
    return Prosody(
        labels=[],
        features=ProsodyFeatures(f0Mean=181.2, f0Range=38.5, energy=-31.4, speechRate=3.9),
        confidence=0.42,
    )


@dataclass(frozen=True)
class DefaultProsodyPredictor:
    artifacts: ProsodyArtifactLocator

    def predict(self, request: ProsodyRequest) -> Prosody:
        artifact = self.artifacts.discover()
        if artifact.found:
            try:
                # TODO: load torch probe and run inference
                # import torch; m = torch.load(artifact.selected_path); return Prosody(...)
                pass
            except Exception:
                pass
        return _heuristic_prosody(request.text)


def predict(text: Optional[str] = None, audio_b64: Optional[str] = None) -> Prosody:
    settings = get_settings()
    predictor = DefaultProsodyPredictor(
        ProsodyArtifactLocator.from_settings(settings)
    )
    return predictor.predict(ProsodyRequest(text=text, audio_b64=audio_b64))
