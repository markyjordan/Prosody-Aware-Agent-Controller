from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse

from ..schemas import TTSRequest
from ..services.tts_service import synthesize_stream, get_cached_audio, get_eleven_client
from ..core.config import get_settings

router = APIRouter()


@router.post("/api/tts")
def tts(req: TTSRequest, request: Request):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")
    # check cached file first for instant serve
    cached = get_cached_audio(req.voice_id, req.model_id, text)
    if cached:
        return FileResponse(
            path=str(cached),
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store", "X-TTS-Cached": "1", "X-Voice-Id": req.voice_id, "X-Model-Id": req.model_id},
        )
    # stream from ElevenLabs (caching inside service)
    try:
        # ensure client can be created (valid key)
        get_eleven_client()
    except HTTPException:
        raise
    audio_iter = synthesize_stream(req.voice_id, req.model_id, text)
    return StreamingResponse(
        audio_iter,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-Voice-Id": req.voice_id,
            "X-Model-Id": req.model_id,
            "X-TTS-Cached": "0",
        },
    )


@router.get("/api/tts/cache")
def tts_cache(voice_id: str = "cgSgspJ2msm6clMCkdW9", model_id: str = "eleven_v3", text: str = ""):
    if not text:
        raise HTTPException(status_code=400, detail="text query required")
    cached = get_cached_audio(voice_id, model_id, text)
    if not cached:
        raise HTTPException(status_code=404, detail="not cached")
    return FileResponse(
        path=str(cached),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store", "X-TTS-Cached": "1"},
    )


# alias for direct calls
@router.post("/tts")
def tts_alias(req: TTSRequest, request: Request):
    return tts(req, request)
