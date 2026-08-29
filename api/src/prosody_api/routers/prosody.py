from fastapi import APIRouter
from ..schemas import ProsodyRequest, Prosody
from ..services.prosody_service import predict

router = APIRouter()


@router.post("/api/prosody", response_model=Prosody)
def prosody(req: ProsodyRequest):
    return predict(text=req.text, audio_b64=req.audio_b64)


@router.get("/api/prosody/health")
def prosody_health():
    # indicates if probe artifact is loaded
    from ..core.config import get_settings
    from pathlib import Path

    settings = get_settings()
    probe_path = Path(settings["probe_path"])
    research_probe = Path(__file__).resolve().parents[4] / "research" / "artifacts" / "probe.pt"
    found = probe_path.exists() or research_probe.exists()
    return {"ok": True, "probe_found": found, "probe_path": str(probe_path)}
