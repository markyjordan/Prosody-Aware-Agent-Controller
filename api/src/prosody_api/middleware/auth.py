import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, enabled: bool = False, api_key: str | None = None):
        super().__init__(app)
        self.enabled = enabled
        self.api_key = api_key

    async def dispatch(self, request: Request, call_next):
        if not self.enabled:
            return await call_next(request)

        path = request.url.path
        # always allow health/docs/openapi without auth
        if path in ("/health", "/api/health", "/docs", "/openapi.json", "/redoc", "/docs/oauth2-redirect"):
            return await call_next(request)
        # allow CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        # check Authorization: Bearer <key> or X-API-Key
        auth = request.headers.get("authorization", "")
        x_key = request.headers.get("x-api-key", "")
        token = None
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
        elif x_key:
            token = x_key.strip()

        if not token or token != self.api_key:
            return JSONResponse(
                status_code=401,
                content={"error": "unauthorized", "path": path},
                headers={"WWW-Authenticate": "Bearer"},
            )
        return await call_next(request)


def setup_auth(
    app: FastAPI,
    enabled: bool | None = None,
    api_key: str | None = None,
) -> None:
    # env: AUTH_ENABLED=1, API_KEY=...
    # also supports AUTH_API_KEY for explicit
    resolved_enabled = (
        os.getenv("AUTH_ENABLED", "0") in ("1", "true", "True")
        if enabled is None
        else enabled
    )
    resolved_api_key = (
        api_key
        or os.getenv("AUTH_API_KEY")
        or os.getenv("API_KEY")
        or os.getenv("ELEVENLABS_API_KEY")
    )
    # strip quotes if present
    if resolved_api_key:
        resolved_api_key = resolved_api_key.strip().strip('"').strip("'")
    app.add_middleware(
        AuthMiddleware,
        enabled=resolved_enabled,
        api_key=resolved_api_key,
    )
