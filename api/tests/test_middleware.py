from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from prosody_api.middleware.auth import setup_auth
from prosody_api.middleware.cors import setup_cors
from prosody_api.middleware.error import setup_error_handlers
from prosody_api.middleware.logging import setup_logging
from prosody_api.middleware.rate_limiting import setup_rate_limiting


def test_cors_allows_known_origin_and_preflight():
    app = FastAPI()
    setup_cors(app)

    @app.get("/api/value")
    def value():
        return {"value": True}

    with TestClient(app) as client:
        response = client.options(
            "/api/value",
            headers={
                "origin": "http://localhost:5173",
                "access-control-request-method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "http://localhost:5173"
    )
    assert response.headers["access-control-allow-credentials"] == "true"


def test_auth_accepts_bearer_and_api_key_and_exempts_health(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "1")
    monkeypatch.setenv("AUTH_API_KEY", '"secret"')
    app = FastAPI()
    setup_auth(app)

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/api/value")
    def value():
        return {"value": True}

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        unauthorized = client.get("/api/value")
        bearer = client.get(
            "/api/value", headers={"authorization": "Bearer secret"}
        )
        api_key = client.get("/api/value", headers={"x-api-key": "secret"})

    assert unauthorized.status_code == 401
    assert unauthorized.json() == {"error": "unauthorized", "path": "/api/value"}
    assert unauthorized.headers["www-authenticate"] == "Bearer"
    assert bearer.status_code == 200
    assert api_key.status_code == 200


def test_auth_uses_provider_key_as_final_fallback(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "true")
    monkeypatch.delenv("AUTH_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "provider-key")
    app = FastAPI()
    setup_auth(app)

    @app.get("/api/value")
    def value():
        return {"value": True}

    with TestClient(app) as client:
        response = client.get(
            "/api/value", headers={"authorization": "Bearer provider-key"}
        )

    assert response.status_code == 200


def test_rate_limit_is_per_api_segment_and_uses_forwarded_ip(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "1")
    monkeypatch.setenv("RATE_LIMIT", "1")
    monkeypatch.setenv("RATE_WINDOW", "60")
    app = FastAPI()
    setup_rate_limiting(app)

    @app.get("/api/one")
    def one():
        return {"ok": True}

    @app.get("/api/two")
    def two():
        return {"ok": True}

    with TestClient(app) as client:
        headers = {"x-forwarded-for": "203.0.113.10, 10.0.0.1"}
        first = client.get("/api/one", headers=headers)
        limited = client.get("/api/one", headers=headers)
        separate_path = client.get("/api/two", headers=headers)

    assert first.headers["x-ratelimit-limit"] == "1"
    assert first.headers["x-ratelimit-remaining"] == "0"
    assert limited.status_code == 429
    assert limited.json()["error"] == "rate limit exceeded"
    assert limited.headers["retry-after"] in {"60", "61"}
    assert separate_path.status_code == 200


def test_rate_limit_can_be_disabled(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    app = FastAPI()
    setup_rate_limiting(app)

    @app.get("/api/value")
    def value():
        return {"ok": True}

    with TestClient(app) as client:
        responses = [client.get("/api/value") for _ in range(3)]

    assert all(response.status_code == 200 for response in responses)
    assert all("x-ratelimit-limit" not in response.headers for response in responses)


def test_logging_preserves_supplied_id_and_generates_short_default():
    app = FastAPI()
    setup_logging(app)

    @app.get("/value")
    def value():
        return {"ok": True}

    with TestClient(app) as client:
        supplied = client.get("/value", headers={"x-request-id": "caller-id"})
        generated = client.get("/value")

    assert supplied.headers["x-request-id"] == "caller-id"
    assert len(generated.headers["x-request-id"]) == 8


def test_error_handlers_preserve_shapes_and_headers():
    app = FastAPI()
    setup_error_handlers(app)
    setup_logging(app)

    @app.get("/http")
    def http_error():
        raise HTTPException(
            status_code=409,
            detail="conflict",
            headers={"x-reason": "test"},
        )

    @app.get("/validation")
    def validation(value: int):
        return {"value": value}

    @app.get("/unhandled")
    def unhandled():
        raise RuntimeError("hidden")

    with TestClient(app, raise_server_exceptions=False) as client:
        http_error = client.get("/http", headers={"x-request-id": "request-1"})
        validation = client.get("/validation")
        unhandled = client.get(
            "/unhandled", headers={"x-request-id": "request-2"}
        )

    assert http_error.status_code == 409
    assert http_error.headers["x-reason"] == "test"
    assert http_error.json() == {
        "error": "conflict",
        "status": 409,
        "path": "/http",
        "request_id": "request-1",
    }
    assert validation.status_code == 422
    assert validation.json()["error"] == "validation failed"
    assert validation.json()["path"] == "/validation"
    assert unhandled.status_code == 500
    assert unhandled.json() == {
        "error": "internal server error",
        "path": "/unhandled",
        "request_id": "request-2",
    }
