from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app

client = TestClient(app)


def test_cors_allows_vite_dev_server():
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_blocks_unknown_origin():
    response = client.get("/health", headers={"Origin": "http://evil.example"})

    assert "access-control-allow-origin" not in response.headers


def test_cors_origins_from_comma_list():
    settings = Settings(_env_file=None, cors_origins="http://a.pl, http://b.pl")

    assert settings.cors_origin_list == ["http://a.pl", "http://b.pl"]
