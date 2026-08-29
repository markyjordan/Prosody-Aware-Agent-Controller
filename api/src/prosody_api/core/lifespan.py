from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from .config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    dependencies = getattr(app.state, "dependencies", None)
    settings = dependencies.settings if dependencies is not None else get_settings()
    # ensure cache dir exists
    Path(settings["cache_dir"]).mkdir(parents=True, exist_ok=True)
    # try load prosody probe artifact if present (research/artifacts/probe.pt)
    probe_path = Path(settings["probe_path"])
    # also check research/artifacts/probe.pt as fallback
    research_probe = Path(__file__).resolve().parents[4] / "research" / "artifacts" / "probe.pt"
    probe_found = probe_path.exists() or research_probe.exists()
    app.state.probe_path = str(probe_path if probe_path.exists() else research_probe if research_probe.exists() else probe_path)
    app.state.probe_found = probe_found
    app.state.probe = None
    if probe_found:
        try:
            # lazy import torch if available
            import torch  # type: ignore

            # placeholder: load artifact (weights) — research pipeline will define format
            # e.g., torch.load(probe_path) or joblib.load
            # keep stub for now
            app.state.probe = {"path": str(probe_path), "loaded": False, "note": "stub — wire to research artifact"}
        except Exception:
            app.state.probe = None
    yield
    # shutdown: nothing to clean
