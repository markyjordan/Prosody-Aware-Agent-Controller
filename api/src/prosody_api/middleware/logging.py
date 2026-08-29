import time
import uuid
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from fastapi import FastAPI

logger = logging.getLogger("prosody_api.access")
# ensure handler if not configured
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())[:8]
        start = time.perf_counter()
        # attach to request state for downstream use
        request.state.request_id = request_id
        try:
            response: Response = await call_next(request)
        except Exception:
            logger.exception(f"[{request_id}] {request.method} {request.url.path} -> exception")
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        # skip health spam unless error
        if not (request.url.path in ("/health", "/api/health") and response.status_code == 200):
            logger.info(
                f"[{request_id}] {request.method} {request.url.path} {response.status_code} {duration_ms:.1f}ms"
            )
        response.headers["x-request-id"] = request_id
        return response


def setup_logging(app: FastAPI) -> None:
    app.add_middleware(LoggingMiddleware)
