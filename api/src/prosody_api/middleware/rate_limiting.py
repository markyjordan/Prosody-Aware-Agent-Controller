import os
import time
from collections import defaultdict, deque
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# simple fixed-window in-memory limiter
# env: RATE_LIMIT_ENABLED=0 to disable (default enabled), RATE_LIMIT=60, RATE_WINDOW=60

def _get_client_ip(request: Request) -> str:
    # x-forwarded-for when behind proxy, else direct
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit: int = 60, window: int = 60, enabled: bool = True):
        super().__init__(app)
        self.limit = limit
        self.window = window
        self.enabled = enabled
        # client -> deque[timestamp]
        self.buckets: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if not self.enabled:
            return await call_next(request)
        # only limit api routes, skip health
        path = request.url.path
        if path in ("/health", "/api/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        # only apply to /api/* to avoid limiting static/docs
        if not path.startswith("/api"):
            return await call_next(request)

        now = time.time()
        ip = _get_client_ip(request)
        # per-ip+path bucket to avoid one endpoint starving others
        key = f"{ip}:{path.split('/')[2] if len(path.split('/')) > 2 else path}"
        bucket = self.buckets[key]

        # purge old
        while bucket and bucket[0] <= now - self.window:
            bucket.popleft()

        if len(bucket) >= self.limit:
            retry_after = int(bucket[0] + self.window - now) + 1
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate limit exceeded",
                    "limit": self.limit,
                    "window": self.window,
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)
        response = await call_next(request)
        response.headers["x-ratelimit-limit"] = str(self.limit)
        response.headers["x-ratelimit-remaining"] = str(max(0, self.limit - len(bucket)))
        return response


def setup_rate_limiting(app: FastAPI) -> None:
    enabled = os.getenv("RATE_LIMIT_ENABLED", "1") not in ("0", "false", "False")
    limit = int(os.getenv("RATE_LIMIT", "60"))
    window = int(os.getenv("RATE_WINDOW", "60"))
    app.add_middleware(RateLimitMiddleware, limit=limit, window=window, enabled=enabled)
