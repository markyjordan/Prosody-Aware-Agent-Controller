import logging
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("prosody_api.error")


def setup_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        # keep FastAPI's detail but add request_id and consistent shape
        request_id = getattr(request.state, "request_id", None)
        logger.warning(f"[{request_id}] HTTP {exc.status_code}: {exc.detail} @ {request.url.path}")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.detail,
                "status": exc.status_code,
                "path": str(request.url.path),
                "request_id": request_id,
            },
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        request_id = getattr(request.state, "request_id", None)
        logger.warning(f"[{request_id}] 422 validation @ {request.url.path}: {exc.errors()}")
        return JSONResponse(
            status_code=422,
            content={
                "error": "validation failed",
                "details": exc.errors(),
                "path": str(request.url.path),
                "request_id": request_id,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", None)
        logger.exception(f"[{request_id}] 500 unhandled @ {request.url.path}: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal server error",
                "path": str(request.url.path),
                "request_id": request_id,
            },
        )
