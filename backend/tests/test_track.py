import asyncio
from datetime import UTC, datetime

import httpx

from app.journeys import JourneyService
from app.models import RawVehicle

NOW = datetime(2026, 11, 12, 12, 0, tzinfo=UTC)
DATE = "2026-11-12"
LINE = [[18.6, 54.35], [18.7, 54.4]]


def vehicle(route_id=8, trip_id=11):
    return RawVehicle(
        vehicle_id=7,
        line="8",
        route_id=route_id,
        trip_id=trip_id,
        timestamp=NOW,
        lat=54.35,
        lon=18.6,
    )


def service(stops_status=200, shape_status=200):
    def handler(request):
        name = request.url.path.rsplit("/", 1)[-1]
        if name == "shapes":
            if shape_status != 200:
                return httpx.Response(shape_status)
            return httpx.Response(200, json={"type": "LineString", "coordinates": LINE})
        if stops_status != 200:
            return httpx.Response(stops_status)
        if name == "stops":
            stops = [
                {"stopId": 1, "stopName": "A", "type": "TRAM", "stopLon": 18.6, "stopLat": 54.35},
                {"stopId": 2, "stopName": "B", "type": "TRAM", "stopLon": 18.7, "stopLat": 54.4},
            ]
            return httpx.Response(200, json={"stops": stops})
        order = [
            {"routeId": 8, "tripId": 11, "stopId": i, "stopSequence": i, "passenger": True}
            for i in (2, 1)
        ]
        return httpx.Response(200, json={"stopsInTrip": order})

    return JourneyService(transport=httpx.MockTransport(handler))


def run(journeys, v):
    async def scenario():
        try:
            return await journeys.get_track(v, NOW)
        finally:
            await journeys.close()

    return asyncio.run(scenario())


def test_track_has_shape_and_ordered_stop_points():
    line, stops = run(service(), vehicle())

    assert line == [tuple(p) for p in LINE]
    assert stops == [(18.6, 54.35), (18.7, 54.4)]


def test_track_without_stop_catalog_still_has_shape():
    line, stops = run(service(stops_status=503), vehicle())

    assert len(line) == 2
    assert stops == []


def test_no_track_for_missing_shape_or_trip():
    assert run(service(shape_status=404), vehicle()) is None
    assert run(service(), vehicle(trip_id=None)) is None
