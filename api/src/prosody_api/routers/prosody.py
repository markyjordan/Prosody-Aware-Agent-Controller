from fastapi import APIRouter, Request

from ..core.artifacts import ProsodyArtifactLocator
from ..schemas import ProsodyRequest, Prosody
from ..services.prosody_service import predict

router = APIRouter()


@router.post("/api/prosody", response_model=Prosody)
def prosody(req: ProsodyRequest, request: Request):
    predictor = request.app.state.dependencies.prosody_predictor
    if predictor:
        return predictor.predict(req)
    return predict(text=req.text, audio_b64=req.audio_b64)


@router.get("/api/prosody/health")
def prosody_health(request: Request):
    dependencies = request.app.state.dependencies
    locator = dependencies.prosody_artifacts or ProsodyArtifactLocator.from_settings(
        dependencies.settings
    )
    artifact = locator.discover()
    return {
        "ok": True,
        "probe_found": artifact.found,
        "probe_path": str(artifact.configured_path),
    }
