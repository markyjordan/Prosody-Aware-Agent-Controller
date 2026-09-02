from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from ..schemas import TTSRequest
from ..services.latency import JsonlLatencySink
from ..services.tts_service import get_cached_audio, get_eleven_client, synthesize_stream

router = APIRouter()


@router.post("/api/tts")
def tts(req: TTSRequest, request: Request):
    dependencies = request.app.state.dependencies
    tts_service = dependencies.tts
    started = dependencies.clock.monotonic()
    sink = dependencies.latency_sink or JsonlLatencySink(
        dependencies.settings.latency_profile_path
    )

    def profile(outcome: str, cached: bool, first_byte=None):
        finished = dependencies.clock.monotonic()
        sink.append(
            {
                "schema_version": 1,
                "kind": "tts",
                "session_id": req.session_id,
                "turn_id": req.turn_id,
                "branch": req.branch,
                "outcome": outcome,
                "provider": "elevenlabs",
                "model": req.model_id,
                "cached": cached,
                "durations_ms": {
                    "backend_total": round((finished - started) * 1000, 3),
                    "provider_first_byte": (
                        round((first_byte - started) * 1000, 3)
                        if first_byte is not None
                        else 0.0 if cached else None
                    ),
                },
            }
        )

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")
    # check cached file first for instant serve
    cached = (
        tts_service.get_cached_audio(req.voice_id, req.model_id, text)
        if tts_service
        else get_cached_audio(req.voice_id, req.model_id, text)
    )
    if cached:
        profile("ok", True)
        return FileResponse(
            path=str(cached),
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store", "X-TTS-Cached": "1", "X-Voice-Id": req.voice_id, "X-Model-Id": req.model_id},
        )
    # stream from ElevenLabs (caching inside service)
    if tts_service:
        audio_iter = tts_service.synthesize_stream(req.voice_id, req.model_id, text)
    else:
        try:
            # Preserve the eager key validation before constructing the stream.
            get_eleven_client()
        except HTTPException:
            raise
        audio_iter = synthesize_stream(req.voice_id, req.model_id, text)

    def profiled_audio():
        first_byte = None
        outcome = "ok"
        try:
            for chunk in audio_iter:
                if chunk and first_byte is None:
                    first_byte = dependencies.clock.monotonic()
                yield chunk
        except Exception:
            outcome = "failed"
            raise
        finally:
            profile(outcome, False, first_byte)

    return StreamingResponse(
        profiled_audio(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-Voice-Id": req.voice_id,
            "X-Model-Id": req.model_id,
            "X-TTS-Cached": "0",
        },
    )


@router.get("/api/tts/cache")
def tts_cache(
    request: Request,
    voice_id: str = "cgSgspJ2msm6clMCkdW9",
    model_id: str = "eleven_v3",
    text: str = "",
):
    if not text:
        raise HTTPException(status_code=400, detail="text query required")
    tts_service = request.app.state.dependencies.tts
    cached = (
        tts_service.get_cached_audio(voice_id, model_id, text)
        if tts_service
        else get_cached_audio(voice_id, model_id, text)
    )
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
