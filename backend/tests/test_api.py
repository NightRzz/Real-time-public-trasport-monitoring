import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import GpsPositionsResponse
from app.store import VehicleStore
from tests.test_models import SAMPLE


@pytest.fixture
def client():
    app.state.store = VehicleStore()
    return TestClient(app)


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_vehicles_empty_before_first_poll(client):
    response = client.get("/api/vehicles")

    assert response.status_code == 200
    assert response.json() == {"type": "FeatureCollection", "features": [], "last_update": None}


def test_vehicles_returns_geojson(client):
    data = GpsPositionsResponse.model_validate(SAMPLE)
    app.state.store.update(data.vehicles, data.last_update)

    body = client.get("/api/vehicles").json()

    assert body["type"] == "FeatureCollection"
    feature = body["features"][0]
    assert feature["geometry"] == {"type": "Point", "coordinates": [18.6059, 54.3235]}
    assert feature["properties"]["vehicle_id"] == 145704
    assert feature["properties"]["line"] == "213"
    assert feature["properties"]["type"] == "bus"
    assert feature["properties"]["timestamp"] == "2026-09-23T12:00:01Z"


def test_openapi_has_vehicles_endpoint(client):
    schema = client.get("/openapi.json").json()

    assert "/api/vehicles" in schema["paths"]
