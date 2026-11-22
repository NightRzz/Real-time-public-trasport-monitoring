import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest

from app.live import (
    LiveFeed,
    Track,
    track_key,
)
from app.models import RawVehicle
from app.progress import METRES_X, METRES_Y
from app.store import VehicleStore

NOW = datetime(2026, 11, 12, 12, 0, 0, tzinfo=UTC)
LAT = 54.35
LINE = [(18.60, LAT), (18.62, LAT)]
STOPS = [(18.605, LAT), (18.615, LAT)]


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


async def no_track(_):
    return None


def feed_with_track(*vehicles, **options):
    store = VehicleStore()
    store.update(list(vehicles), NOW)
    feed = LiveFeed(store, no_track, clock=lambda: NOW, **options)
    for v in vehicles:
        feed._tracks[track_key(v, NOW)] = Track.build(LINE, STOPS)
    return feed


def along(feature):
    return (feature["geometry"]["coordinates"][0] - 18.60) * METRES_X


def test_track_places_stops_and_points():
    track = Track.build(LINE, [STOPS[0], None, (18.90, 54.90), STOPS[1]])

    assert track.length == pytest.approx(0.02 * METRES_X)
    assert track.stop_alongs[0] == pytest.approx(0.005 * METRES_X)
    assert track.stop_alongs[1] is None
    assert track.stop_alongs[2] is None
    assert track.stops == pytest.approx([0.005 * METRES_X, 0.015 * METRES_X])
    point, bearing = track.point_at(100)
    assert point[0] == pytest.approx(east(100))
    assert bearing == pytest.approx(90)


def test_track_slice_follows_the_line():
    track = Track.build([(18.60, LAT), (18.61, LAT), (18.61, north(500))], [])

    path = track.slice(100, track.cumulative[1] + 100)

    assert path[0] == [pytest.approx(east(100)), pytest.approx(LAT)]
    assert path[1] == [18.61, LAT]
    assert path[-1][0] == pytest.approx(18.61)
    assert path[-1][1] == pytest.approx(north(100), abs=1e-6)


def test_transition_snaps_vehicle_onto_route():
    v = vehicle(lat=north(30), speed=0)
    feature = feed_with_track(v).transition(v, NOW)

    assert feature["properties"]["snapped"] is True
    assert feature["geometry"]["coordinates"][1] == pytest.approx(LAT)
    assert along(feature) == pytest.approx(65, abs=0.5)
    assert "path" not in feature["properties"]


def test_transition_sends_route_path_for_fresh_fix():
    first = vehicle(lon=east(65), age=20)
    feed = feed_with_track(first, interpolation_mode="snap")
    feed.transition(first, NOW)
    second = vehicle(lon=east(265), age=0)

    feature = feed.transition(second, NOW)

    assert feature["properties"]["path"][0][0] == pytest.approx(east(65), abs=1e-6)
    assert feature["properties"]["path"][-1][0] == pytest.approx(east(265), abs=1e-6)
    feed._fixes[1].seen_at -= 10
    assert "path" not in feed.transition(second, NOW)["properties"]


def test_damped_mode_advances_smoothly_and_clamps_before_next_stop():
    v = vehicle(lon=east(65), speed=36.0, age=0)
    feed = feed_with_track(v)
    stop_m = 0.005 * METRES_X

    f0 = feed.transition(v, NOW, glide_ms=1050)
    f5 = feed.transition(v, NOW + timedelta(seconds=5), glide_ms=1050)
    f25 = feed.transition(v, NOW + timedelta(seconds=25), glide_ms=1050)

    assert along(f0) == pytest.approx(65, abs=0.5)
    assert f0["properties"]["extrapolated"] is False
    assert along(f5) > along(f0) + 30
    assert f5["properties"]["extrapolated"] is True
    assert f5["properties"]["glide_ms"] == 1050
    assert "path" in f5["properties"]
    assert along(f25) > along(f5)
    assert along(f25) < stop_m


def test_damped_mode_stops_before_close_stop_and_is_idempotent_per_tick():
    stop_m = 0.005 * METRES_X
    v = vehicle(lon=east(stop_m - 40), speed=54.0, age=0)
    feed = feed_with_track(v)

    feed.transition(v, NOW, glide_ms=1050)
    t10_a = feed.transition(v, NOW + timedelta(seconds=10), glide_ms=1050)
    t10_b = feed.transition(v, NOW + timedelta(seconds=10), glide_ms=1050)

    assert t10_a == t10_b
    assert along(t10_a) < stop_m + 0.5
    assert along(t10_a) > stop_m - 40


def test_damped_mode_holds_without_rewinding_on_small_overshoot():
    first = vehicle(lon=east(65), speed=54.0, age=0)
    feed = feed_with_track(first)
    feed.transition(first, NOW)
    projected = along(feed.transition(first, NOW + timedelta(seconds=10)))
    assert projected > 160

    # Vehicle actually slowed down 35 m behind our projection.
    second = vehicle(lon=east(projected - 35), speed=0.0, age=-10)
    held = feed.transition(second, NOW + timedelta(seconds=10))
    assert along(held) == pytest.approx(projected, abs=0.5)
    assert held["properties"]["holding"] is True


def test_vehicle_far_from_route_keeps_raw_gps():
    v = vehicle(lat=north(200))
    feed = feed_with_track(v)

    assert feed.transition(v, NOW) is None


def test_stale_vehicle_is_left_raw():
    v = vehicle(age=120)
    feed = feed_with_track(v)

    assert feed.transition(v, NOW) is None


def test_frame_filters_by_viewport_and_keeps_selected():
    inside = vehicle(vehicle_id=1)
    outside = vehicle(vehicle_id=2, lon=18.90, lat=54.50)
    feed = feed_with_track(inside, outside)
    client = feed.connect(None)
    client.bbox, client.zoom = (18.59, 54.34, 18.63, 54.36), 15

    frame = feed.frame(client)

    assert frame["total"] == 2
    assert frame["detailed"] is True
    assert [f["id"] for f in frame["features"]] == [1]
    assert frame["features"][0]["properties"]["snapped"] is True
    client.selected = 2
    assert sorted(f["id"] for f in feed.frame(client)["features"]) == [1, 2]
    client.selected = None
    assert feed.handle(client, json.dumps({"type": "watch", "vehicle_ids": [2]}))
    assert sorted(f["id"] for f in feed.frame(client)["features"]) == [1, 2]


def test_overview_sends_raw_positions_for_whole_area():
    v = vehicle(lat=north(30), speed=36, age=10)
    feed = feed_with_track(v)
    client = feed.connect(None)
    client.bbox, client.zoom = (18.0, 54.0, 19.0, 55.0), 11

    feature = feed.frame(client)["features"][0]

    assert feature["properties"]["snapped"] is False
    assert feature["geometry"]["coordinates"] == [pytest.approx(v.lon), pytest.approx(v.lat)]


def test_handle_accepts_viewport_and_selection_and_rejects_garbage():
    feed = LiveFeed(VehicleStore(), no_track)
    client = feed.connect(None)

    assert feed.handle(client, json.dumps({"type": "viewport", "bbox": [1, 2, 3, 4], "zoom": 14}))
    assert client.bbox == (1, 2, 3, 4) and client.zoom == 14
    assert feed.handle(client, json.dumps({"type": "select", "vehicle_id": 5}))
    assert client.selected == 5
    assert not feed.handle(client, "not json")
    assert not feed.handle(client, json.dumps({"type": "viewport", "bbox": [3, 2, 1, 4]}))
    assert not feed.handle(client, json.dumps({"type": "unknown"}))
    assert client.bbox == (1, 2, 3, 4)


def test_missing_track_is_loaded_in_background():
    calls = []

    async def loader(v):
        calls.append(v.vehicle_id)
        return LINE, STOPS

    async def scenario():
        v = vehicle(speed=0)
        store = VehicleStore()
        store.update([v], NOW)
        feed = LiveFeed(store, loader, clock=lambda: NOW)
        assert feed.transition(v, NOW) is None
        await asyncio.sleep(0.01)
        return feed.transition(v, NOW)

    assert asyncio.run(scenario())["properties"]["snapped"] is True
    assert calls == [1]


def test_failed_track_is_not_retried_immediately():
    calls = []

    async def loader(v):
        calls.append(v.vehicle_id)
        raise RuntimeError("shapes down")

    async def scenario():
        v = vehicle()
        feed = LiveFeed(VehicleStore(), loader, clock=lambda: NOW)
        feed.transition(v, NOW)
        await asyncio.sleep(0.01)
        feed.transition(v, NOW)
        await asyncio.sleep(0.01)

    asyncio.run(scenario())
    assert calls == [1]


class Socket:
    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    async def send_text(self, data):
        if self.fail:
            raise ConnectionError("gone")
        self.sent.append(json.loads(data))


def test_broadcast_respects_cadence_and_drops_dead_clients():
    async def scenario():
        feed = feed_with_track(vehicle())
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
