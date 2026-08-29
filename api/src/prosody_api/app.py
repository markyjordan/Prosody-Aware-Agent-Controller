from fastapi import FastAPI

from .core.lifespan import lifespan
from .middleware.cors import setup_cors
from .middleware.logging import setup_logging
from .middleware.error import setup_error_handlers
from .middleware.rate_limiting import setup_rate_limiting
from .middleware.auth import setup_auth
from .routers.tts import router as tts_router
from .routers.prosody import router as prosody_router
from .routers.controller import router as controller_router
from .schemas import HealthResponse

app = FastAPI(title="Prosody-Aware Agent Controller", lifespan=lifespan)

# middleware stack — FastAPI routers use `routers/` (APIRouter), middleware lives in `middleware/`
# order: error handlers (exception) outermost, then logging, rate-limiting, auth, cors last (outermost for preflight)
setup_error_handlers(app)
setup_logging(app)
setup_rate_limiting(app)
setup_auth(app)
setup_cors(app)

# health
@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(ok=True)


@app.get("/api/health", response_model=HealthResponse)
def api_health():
    return HealthResponse(ok=True)


# mount pipeline routers
# TTS: POST /api/tts  (ElevenLabs eleven_v3, cached, footer play buttons)
# Prosody: POST /api/prosody (debug, loads research artifact)
# Controller: POST /api/condition/{branch} (OpenAI, streams SSE) — keeps mock WS on :8787 for now
app.include_router(tts_router)
app.include_router(prosody_router)
app.include_router(controller_router)
# audio WS router is scaffolded as POST /ws placeholder; real WS will replace mock later
# from .routers.audio import router as audio_router
# app.include_router(audio_router)
