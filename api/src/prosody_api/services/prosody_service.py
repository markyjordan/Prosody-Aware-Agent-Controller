"""
Prosody Pipeline — loads linear probe artifact from research/artifacts/probe.pt

research/ builds data→inference pipeline + exports artifact.
api serving loads it at lifespan startup (core/lifespan.py).

For now: heuristic fallback if artifact missing.
"""
from pathlib import Path
from typing import Optional

from ..core.config import get_settings
from ..schemas import Prosody, ProsodyFeatures


def _heuristic_prosody(text: Optional[str] = None) -> Prosody:
    # very small heuristic matching scenarios.mjs
    # keep stub lightweight until probe artifact exists
    return Prosody(
        labels=[],
        features=ProsodyFeatures(f0Mean=181.2, f0Range=38.5, energy=-31.4, speechRate=3.9),
        confidence=0.42,
    )


def predict(text: Optional[str] = None, audio_b64: Optional[str] = None) -> Prosody:
    settings = get_settings()
    probe_path = Path(settings["probe_path"])
    research_probe = Path(__file__).resolve().parents[4] / "research" / "artifacts" / "probe.pt"

    artifact = probe_path if probe_path.exists() else research_probe if research_probe.exists() else None
    if artifact and artifact.exists():
        try:
            # TODO: load torch probe and run inference
            # import torch; m = torch.load(artifact); return Prosody(...)
            pass
        except Exception:
            pass
    # fallback heuristic
    return _heuristic_prosody(text)
