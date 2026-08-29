from contextlib import asynccontextmanager
from fastapi import FastAPI

from .artifacts import ProsodyArtifactLocator
from .config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    dependencies = getattr(app.state, "dependencies", None)
    settings = dependencies.settings if dependencies is not None else get_settings()
    # ensure cache dir exists
    settings["cache_dir"].mkdir(parents=True, exist_ok=True)
    locator = (
        dependencies.prosody_artifacts
        if dependencies is not None and dependencies.prosody_artifacts is not None
        else ProsodyArtifactLocator.from_settings(settings)
    )
    artifact = locator.discover()
    app.state.probe_path = str(artifact.selected_path)
    app.state.probe_found = artifact.found
    app.state.probe = None
    if artifact.found:
        try:
            # lazy import torch if available
            import torch  # type: ignore

            # placeholder: load artifact (weights) — research pipeline will define format
            # e.g., torch.load(probe_path) or joblib.load
            # keep stub for now
            app.state.probe = {
                "path": str(artifact.configured_path),
                "loaded": False,
                "note": "stub — wire to research artifact",
            }
        except Exception:
            app.state.probe = None
    yield
    # shutdown: nothing to clean
