"""Run directly with `cd backend && PYTHONPATH=. .venv/bin/python tests/test_journeys.py`."""

import asyncio
from collections import Counter
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import httpx

from app.journeys import Cache, JourneyService
from app.models import RawVehicle


async def check():
    now = datetime(2026, 10, 18, 22, 5, tzinfo=UTC)
    date = "2026-10-19"  # Warsaw is already on the following calendar day.
    vehicle = RawVehicle(
        vehicle_id=7,
        line="8",
        route_id=8,
        trip_id=11,
        scheduled_trip_start_time=now,
        timestamp=now,
        lat=54.35,
        lon=18.6,
    )
    departure = dict(
        vehicleId=7,
        routeId=8,
        tripId=11,
        status="REALTIME",
        scheduledTripStartTime=now.isoformat(),
        timestamp=now.isoformat(),
        estimatedTime=(now + timedelta(minutes=4)).isoformat(),
        theoreticalTime=(now + timedelta(minutes=5)).isoformat(),
        routeShortName="8",
        headsign="Jelitkowo",
    )
    boards = {
        str(i): dict(lastUpdate=now.isoformat(), departures=[dict(departure)]) for i in (1, 2)
    }
    boards["2"]["departures"][0]["estimatedTime"] = (now + timedelta(minutes=1)).isoformat()
    calls, failures = Counter(), set()

    def handler(request):
        name = request.url.path.rsplit("/", 1)[-1]
        calls[name] += 1
        if name in failures:
            return httpx.Response(503)
        if name == "shapes":
            assert dict(request.url.params) == dict(date=date, routeId="8", tripId="11")
        payload = {
            "shapes": dict(type="LineString", coordinates=[[18.6, 54.35], [18.7, 54.4]]),
            "stops.json": {
                date: {
                    "stops": [
                        dict(
                            stopId=i,
                            stopName=f"Stop {i}",
                            stopCode="01",
                            type="TRAM",
                            stopLon=18.6,
                            stopLat=54.35,
                        )
                        for i in (1, 2)
                    ]
                    + [
                        dict(stopId=3, type="UNKNOWN"),
                        dict(stopId=4, type="BUS", virtual=1),
                        dict(stopId=5, type="BUS", nonpassenger=1),
                        dict(stopId=6, type="BUS", depot=1),
                        dict(stopId=7, type="BUS", stopLon="nan", stopLat=54.35),
                    ]
                }
            },
            "stopsintrip.json": {
                date: {
                    "stopsInTrip": [
                        dict(routeId=8, tripId=11, stopId=i, stopSequence=i, passenger=True)
                        for i in (2, 1)
                    ]
                    + [
                        dict(routeId=8, tripId=12, stopId=3, stopSequence=1, passenger=True),
                        dict(routeId=9, tripId=11, stopId=3, stopSequence=1, passenger=True),
                        dict(routeId=8, tripId=11, stopId=4, stopSequence=0, passenger=True),
                    ]
                }
            },
            "departures": boards,
        }
        return httpx.Response(200, json=payload[name])

    async def journey(selected=vehicle):
        service = JourneyService(transport=httpx.MockTransport(handler))
        try:
            return await service.get_journey(selected, now=now)
        finally:
            await service.close()

    service = JourneyService(transport=httpx.MockTransport(handler))
    try:
        a, b = await asyncio.gather(
            service.get_journey(vehicle, now), service.get_journey(vehicle, now)
        )
        assert a == b and all(count == 1 for count in calls.values())
        assert a.next_stop.stop.stop_id == 1  # Route order wins over an inconsistent earlier ETA.
        assert a.route.geometry.coordinates == [(18.6, 54.35), (18.7, 54.4)]
        assert a.stop_ids == [1, 2]  # Exact variant: exclude opposite direction and depot stops.
        assert not {"stops", "service_date"} & a.model_dump().keys()
        assert set(a.next_stop.stop.model_dump()) == {"stop_id", "name", "code"}
        stops = await service.get_stops(now)
        assert [stop.id for stop in stops.features] == [1, 2]
        assert stops.features[0].properties.type == "tram"
        assert stops.features[0].geometry.coordinates == (18.6, 54.35)
        assert calls["stops.json"] == 1  # Same catalog as vehicle predictions.
        arrivals = await service.get_stop_arrivals(1, now)
        assert arrivals.status == "available" and arrivals.arrivals[0].realtime
        assert arrivals.arrivals[0].time == now + timedelta(minutes=4)
        assert calls["departures"] == 1  # Shared with vehicle predictions.
        assert (await service.get_stop_arrivals(99, now)).status == "unavailable"
    finally:
        await service.close()

    missing = boards.pop("1")
    assert (
        await journey()
    ).next_stop.stop.stop_id == 2  # Explicitly the next available prediction.
    boards["1"] = missing

    for field, bad in (
        ("vehicleId", 8),
        ("tripId", 12),
        ("routeId", 9),
        ("status", "SCHEDULED"),
        ("scheduledTripStartTime", (now + timedelta(hours=1)).isoformat()),
        ("estimatedTime", (now - timedelta(seconds=1)).isoformat()),
    ):
        for board in boards.values():
            board["departures"] = [{**departure, field: bad}]
        result = await journey()
        assert result.next_stop is None and result.prediction_status == "unavailable"
    for board in boards.values():
        board["departures"] = [departure]
    for source in ("timestamp", "lastUpdate"):
        for board in boards.values():
            if source == "timestamp":
                board["departures"] = [
                    {**departure, source: (now - timedelta(minutes=5)).isoformat()}
                ]
            else:
                board[source] = (now - timedelta(minutes=5)).isoformat()
        assert (await journey()).prediction_status == "stale"
        for board in boards.values():
            board["lastUpdate"], board["departures"] = now.isoformat(), [departure]
    assert (
        await journey(vehicle.model_copy(update={"timestamp": now - timedelta(minutes=5)}))
    ).prediction_status == "stale"
    for source in ("stops.json", "stopsintrip.json", "departures", "shapes"):
        failures.add(source)
        result = await journey()
        assert (result.route is None) == (source == "shapes")
        assert (result.next_stop is None) == (source != "shapes")
        assert result.stop_ids == (None if source in {"stops.json", "stopsintrip.json"} else [1, 2])
        failures.clear()

    service = JourneyService(transport=httpx.MockTransport(handler))
    try:
        boards["1"]["departures"] = [
            {
                **departure,
                "status": "SCHEDULED",
                "estimatedTime": (now + timedelta(hours=1)).isoformat(),
            },
            {**departure, "estimatedTime": (now - timedelta(seconds=1)).isoformat()},
            {**departure, "timestamp": (now - timedelta(minutes=5)).isoformat()},
            {**departure, "estimatedTime": (now + timedelta(minutes=1)).isoformat()},
        ]
        arrivals = await service.get_stop_arrivals(1, now)
        assert [a.time for a in arrivals.arrivals] == [
            now + timedelta(minutes=1),
            now + timedelta(minutes=5),
        ]
        assert [a.realtime for a in arrivals.arrivals] == [True, False]
        assert (await service.get_stop_arrivals(1, now + timedelta(minutes=2))).status == "stale"
    finally:
        await service.close()
        boards["1"]["departures"] = [departure]
    calls.clear()
    assert (await journey(vehicle.model_copy(update={"trip_id": None}))).route is None
    assert not calls
    assert (
        await journey(vehicle.model_copy(update={"scheduled_trip_start_time": None}))
    ).next_stop is None

    cache = Cache(capacity=1)
    loads = 0

    async def load():
        nonlocal loads
        loads += 1
        return loads

    with patch("app.journeys.monotonic", return_value=0):
        assert await cache.get("a", 5, load) == await cache.get("a", 5, load) == 1
        assert await cache.get("b", 5, load) == 2  # Capacity eviction.
        assert await cache.get("a", 5, load) == 3
    with patch("app.journeys.monotonic", return_value=6):
        assert await cache.get("a", 5, load) == 4  # TTL expiry.


def test_journeys():
    asyncio.run(check())


if __name__ == "__main__":
    test_journeys()
