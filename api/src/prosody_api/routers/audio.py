from fastapi import APIRouter, WebSocket

router = APIRouter()

# Audio Ingress WS — buffer/normalize, fans to ElevenLabs ASR + prosody pipeline
# For now, keep mock WS on :8787 for frontend UI work (your #4). This is the future replacement.

@router.websocket("/ws")
async def ws_audio(ws: WebSocket):
    await ws.accept()
    # services/audio_ingress.py, asr_service.py, prosody_service.py would be wired here
    # stub: echo mock behavior
    try:
        while True:
            msg = await ws.receive_text()
            # TODO: parse {type: audio.delta|utterance.begin|utterance.end|session.init}
            # forward to asr_service + prosody_service, emit asr.partial/prosody.update/asr.final
            await ws.send_text(msg)
    except Exception:
        pass
