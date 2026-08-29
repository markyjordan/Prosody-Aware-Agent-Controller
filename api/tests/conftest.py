import os

import pytest
from fastapi.testclient import TestClient


for credential in (
    "API_KEY",
    "AUTH_API_KEY",
    "ELEVENLABS_API_KEY",
    "OPENAI_API_KEY",
):
    os.environ[credential] = ""

os.environ["AUTH_ENABLED"] = "0"
os.environ["RATE_LIMIT_ENABLED"] = "1"
os.environ["RATE_LIMIT"] = "60"
os.environ["RATE_WINDOW"] = "60"

from prosody_api.app import app  # noqa: E402


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
