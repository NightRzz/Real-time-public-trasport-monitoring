import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest

from app.live import (
    LiveFeed,
)
from app.models import RawVehicle
from app.progress import METRES_X, METRES_Y
from app.store import VehicleStore

NOW = datetime(2026, 11, 12, 12, 0, 0, tzinfo=UTC)
LAT = 54.35


def east(metres):
    return 18.60 + metres / METRES_X


def north(metres):
    return LAT + metres / METRES_Y


def vehicle(lon=None, lat=LAT, speed=36.0, age=0.0, vehicle_id=1, trip_id=7):
    return RawVehicle.model_validate(
        {
            "vehicleId": vehicle_id,
            "routeShortName": "8",
            "routeId": 8,
            "tripId": trip_id,
            "lat": lat,
            "lon": east(65) if lon is None else lon,
            "speed": speed,
            "direction": 90,
            "generated": (NOW - timedelta(seconds=age)).isoformat(),
        }
    )


def feed_with(*vehicles, **options):
    store = VehicleStore()
    store.update(list(vehicles), NOW)
    return LiveFeed(store, clock=lambda: NOW, **options)


def test_frame_filters_by_viewport_and_keeps_selected():
    inside = vehicle(vehicle_id=1)
    outside = vehicle(vehicle_id=2, lon=18.90, lat=54.50)
    feed = feed_with(inside, outside)
    client = feed.connect(None)
    client.bbox, client.zoom = (18.59, 54.34, 18.63, 54.36), 15

    frame = feed.frame(client)

    assert frame["total"] == 2
    assert frame["detailed"] is True
    assert [f["id"] for f in frame["features"]] == [1]
    client.selected = 2
    assert sorted(f["id"] for f in feed.frame(client)["features"]) == [1, 2]
    client.selected = None
    assert feed.handle(client, json.dumps({"type": "watch", "vehicle_ids": [2]}))
    assert sorted(f["id"] for f in feed.frame(client)["features"]) == [1, 2]


def test_overview_sends_raw_positions_for_whole_area():
    v = vehicle(lat=north(30), speed=36, age=10)
    feed = feed_with(v)
    client = feed.connect(None)
    client.bbox, client.zoom = (18.0, 54.0, 19.0, 55.0), 11

    feature = feed.frame(client)["features"][0]

    assert feature["geometry"]["coordinates"] == [pytest.approx(v.lon), pytest.approx(v.lat)]


def test_handle_accepts_viewport_and_selection_and_rejects_garbage():
    feed = LiveFeed(VehicleStore())
    client = feed.connect(None)

    assert feed.handle(client, json.dumps({"type": "viewport", "bbox": [1, 2, 3, 4], "zoom": 14}))
    assert client.bbox == (1, 2, 3, 4) and client.zoom == 14
    assert feed.handle(client, json.dumps({"type": "select", "vehicle_id": 5}))
    assert client.selected == 5
    assert not feed.handle(client, "not json")
    assert not feed.handle(client, json.dumps({"type": "viewport", "bbox": [3, 2, 1, 4]}))
    assert not feed.handle(client, json.dumps({"type": "unknown"}))
    assert client.bbox == (1, 2, 3, 4)


class Socket:
    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    async def send_text(self, data):
        if self.fail:
            raise ConnectionError("gone")
        self.sent.append(json.loads(data))


def test_broadcast_respects_cadence_and_drops_dead_clients():
    async def scenario():
        feed = feed_with(vehicle())
        detailed, overview, dead = Socket(), Socket(), Socket(fail=True)
        for socket, zoom in ((detailed, 15), (overview, 11), (dead, 15)):
            client = feed.connect(socket)
            client.bbox, client.zoom = (18.0, 54.0, 19.0, 55.0), zoom
        await feed.broadcast()
        await asyncio.sleep(1.0)
        await feed.broadcast()
        return feed, detailed, overview

    feed, detailed, overview = asyncio.run(scenario())
    assert len(detailed.sent) == 2
    assert len(overview.sent) == 1
    assert len(feed.clients) == 2
