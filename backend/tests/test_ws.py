import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.live import LiveFeed
from app.main import app
from app.models import GpsPositionsResponse
from app.store import VehicleStore
from tests.test_models import SAMPLE


@pytest.fixture
def client():
    store = VehicleStore()
    data = GpsPositionsResponse.model_validate(SAMPLE)
    store.update(data.vehicles, data.last_update)
    app.state.store = store
    app.state.live = LiveFeed(store)
    return TestClient(app)


def test_socket_sends_all_vehicles_then_follows_viewport(client):
    with client.websocket_connect(
        "/ws/vehicles", headers={"origin": "http://localhost:5173"}
    ) as socket:
        first = socket.receive_json()
        assert first["type"] == "vehicles"
        assert first["total"] == 1
        assert [f["id"] for f in first["features"]] == [145704]
        assert first["last_update"] == "2026-09-23T12:00:05+00:00"

        socket.send_text(json.dumps({"type": "viewport", "bbox": [0, 0, 1, 1], "zoom": 15}))
        empty = socket.receive_json()
        assert empty["features"] == []
        assert empty["total"] == 1
        assert empty["detailed"] is True

        socket.send_text(json.dumps({"type": "select", "vehicle_id": 145704}))
        assert [f["id"] for f in socket.receive_json()["features"]] == [145704]


def test_socket_ignores_invalid_messages(client):
    with client.websocket_connect("/ws/vehicles") as socket:
        socket.receive_json()
        socket.send_text("garbage")
        socket.send_text(json.dumps({"type": "viewport", "bbox": [1, 1, 0, 0], "zoom": 3}))
        socket.send_text(json.dumps({"type": "select", "vehicle_id": None}))
        assert socket.receive_json()["type"] == "vehicles"


def test_socket_rejects_foreign_origin(client):
    with pytest.raises(WebSocketDisconnect) as info:
        with client.websocket_connect("/ws/vehicles", headers={"origin": "http://evil.example"}):
            pass
    assert info.value.code == 1008
