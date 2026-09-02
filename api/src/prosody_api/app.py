from fastapi import FastAPI

from .core.config import Settings, get_settings
from .core.dependencies import DependencyContainer
from .core.lifespan import lifespan
from .middleware.auth import setup_auth
from .middleware.cors import setup_cors
from .middleware.error import setup_error_handlers
from .middleware.logging import setup_logging
from .middleware.rate_limiting import setup_rate_limiting
from .routers.controller import router as controller_router
from .routers.audio import router as audio_router
from .routers.prosody import router as prosody_router
from .routers.tts import router as tts_router
from .schemas import HealthResponse


def create_app(
    settings: Settings | None = None,
    dependencies: DependencyContainer | None = None,
) -> FastAPI:
    if settings is not None and dependencies is not None:
        raise ValueError("pass settings or dependencies, not both")

    container = dependencies or DependencyContainer(settings or get_settings())
    app = FastAPI(title="Prosody-Aware Agent Controller", lifespan=lifespan)
    app.state.dependencies = container

    # CORS is added last so it remains the outermost request middleware.
    setup_error_handlers(app)
    setup_logging(
        app,
        clock=container.clock.monotonic,
        request_id_provider=container.request_id_provider,
    )
    setup_rate_limiting(
        app,
        enabled=container.settings.rate_limit_enabled,
        limit=container.settings.rate_limit,
        window=container.settings.rate_window,
        clock=container.clock.time,
    )
    setup_auth(
        app,
        enabled=container.settings.auth_enabled,
        api_key=container.settings.auth_api_key,
    )
    setup_cors(app)

    @app.get("/health", response_model=HealthResponse)
    def health():
        return HealthResponse(ok=True)

    @app.get("/api/health", response_model=HealthResponse)
    def api_health():
        return HealthResponse(ok=True)

    app.include_router(tts_router)
    app.include_router(prosody_router)
    app.include_router(controller_router)
    app.include_router(audio_router)
    return app


app = create_app()
