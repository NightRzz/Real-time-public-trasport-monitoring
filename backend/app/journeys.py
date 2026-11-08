"""Published route geometry and vehicle-specific predictions from ZTM Gdansk."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from time import monotonic
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.models import RawVehicle
from app.progress import passed_stops
from app.schemas import (
    JourneyStop,
    LineGeometry,
    NextStop,
    PointGeometry,
    RouteFeature,
    RouteStop,
    StopArrival,
    StopArrivals,
    StopFeature,
    StopFeatureCollection,
    StopProperties,
    VehicleJourney,
)
from app.vehicle_type import detect_vehicle_type

logger = logging.getLogger(__name__)
WARSAW = ZoneInfo("Europe/Warsaw")
RESOURCE_BASE = (
    "https://ckan.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/"
)
STOPS_URL = RESOURCE_BASE + "4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json"
STOP_ORDER_URL = RESOURCE_BASE + "3115d29d-b763-4af5-93f6-763b835967d6/download/stopsintrip.json"
SHAPES_URL = "https://ckan2.multimediagdansk.pl/shapes"
DEPARTURES_URL = "https://ckan2.multimediagdansk.pl/departures"
MAX_LIVE_AGE_SECONDS = 90


class Cache:
    """Bounded TTL cache; concurrent selections share upstream requests."""

    def __init__(self, capacity: int = 128) -> None:
        self._entries: dict[Any, tuple[float, Any]] = {}
        # ponytail: misses serialize per cache; use per-key locks if concurrent selections grow.
        self._lock = asyncio.Lock()
        self._capacity = capacity

    async def get(self, key: Any, ttl: float, load: Callable[[], Awaitable[Any]]) -> Any:
        async with self._lock:
            cached = self._entries.get(key)
            if cached and cached[0] > monotonic():
                return cached[1]
            value = await load()
            self._entries = {k: v for k, v in self._entries.items() if v[0] > monotonic()}
            if len(self._entries) >= self._capacity:
                self._entries.pop(next(iter(self._entries)))
            self._entries[key] = (monotonic() + ttl, value)
            return value


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except ValueError:
        return None


def is_fresh(timestamp: datetime, now: datetime) -> bool:
    return -30 <= (now - timestamp).total_seconds() <= MAX_LIVE_AGE_SECONDS


def stop_coordinates(stop: dict) -> tuple[float, float] | None:
    try:
        lon, lat = float(stop["stopLon"]), float(stop["stopLat"])
    except (KeyError, TypeError, ValueError):
        return None
    return (lon, lat) if -180 <= lon <= 180 and -90 <= lat <= 90 else None


class JourneyService:
    def __init__(
        self, timeout: float = 5.0, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._client = httpx.AsyncClient(timeout=timeout, transport=transport)
        self._static = Cache(capacity=4)
        self._shapes = Cache()
        self._departures = Cache(capacity=1)

    async def close(self) -> None:
        await self._client.aclose()

    async def _json(self, url: str, **params: Any) -> Any:
        response = await self._client.get(url, params=params)
        response.raise_for_status()
        return response.json()

    async def _daily(self, url: str, date: str, field: str) -> list[dict]:
        async def load() -> list[dict]:
            # The downloads include multiple dates. Retain only the requested day's data.
            payload = await self._json(url)
            rows = payload[date][field]
            if not isinstance(rows, list):
                raise ValueError("Invalid static resource")
            return rows

        return await self._static.get((url, date), 3600, load)

    async def _stop_catalog(self, date: str) -> dict[int, dict]:
        return {
            stop["stopId"]: stop
            for stop in await self._daily(STOPS_URL, date, "stops")
            if not (stop.get("nonpassenger") or stop.get("virtual") or stop.get("depot"))
        }

    async def get_stops(self, now: datetime | None = None) -> StopFeatureCollection:
        date = (now or datetime.now(UTC)).astimezone(WARSAW).date().isoformat()
        features = []
        for stop in (await self._stop_catalog(date)).values():
            if stop.get("type") not in {"BUS", "TRAM", "BUS_TRAM"}:
                continue
            coordinates = stop_coordinates(stop)
            try:
                if coordinates is None:
                    raise ValueError("Invalid stop coordinates")
                features.append(
                    StopFeature(
                        id=stop["stopId"],
                        geometry=PointGeometry(coordinates=coordinates),
                        properties=StopProperties(
                            stop_id=stop["stopId"],
                            name=stop["stopName"],
                            code=stop.get("stopCode"),
                            type=stop["type"].lower(),
                        ),
                    )
                )
            except (KeyError, TypeError, ValueError):
                logger.warning("Invalid stop record: %s", stop.get("stopId"))
        return StopFeatureCollection(features=features)

    async def get_stop_arrivals(self, stop_id: int, now: datetime | None = None) -> StopArrivals:
        now = now or datetime.now(UTC)
        payload = await self._departures.get("all", 20, lambda: self._json(DEPARTURES_URL))
        board = payload.get(str(stop_id))
        if not isinstance(board, dict):
            return StopArrivals()
        updated = parse_time(board.get("lastUpdate"))
        if not updated:
            return StopArrivals()
        if not is_fresh(updated, now):
            return StopArrivals(status="stale")
        arrivals, stale = [], False
        for departure in board.get("departures", []):
            status = departure.get("status")
            if status not in {"REALTIME", "SCHEDULED"}:
                continue
            time = parse_time(
                departure.get("estimatedTime" if status == "REALTIME" else "theoreticalTime")
            )
            timestamp = parse_time(departure.get("timestamp"))
            if not time or time < now or not timestamp:
                continue
            if not is_fresh(timestamp, now):
                stale = True
                continue
            line, headsign = departure.get("routeShortName"), departure.get("headsign")
            if not isinstance(line, str) or not line.strip() or not isinstance(headsign, str):
                continue
            arrivals.append(
                StopArrival(
                    vehicle_id=departure.get("vehicleId") if status == "REALTIME" else None,
                    route_id=departure.get("routeId"),
                    trip_id=departure.get("tripId"),
                    scheduled_trip_start_time=parse_time(departure.get("scheduledTripStartTime")),
                    line=line,
                    type=detect_vehicle_type(line),
                    headsign=headsign,
                    time=time,
                    realtime=status == "REALTIME",
                    updated_at=min(updated, timestamp),
                )
            )
        return StopArrivals(
            arrivals=sorted(arrivals, key=lambda arrival: arrival.time)[:8],
            status="stale" if stale and not arrivals else "available",
        )

    async def _route(self, vehicle: RawVehicle, date: str) -> RouteFeature | None:
        async def load() -> RouteFeature | None:
            try:
                payload = await self._json(
                    SHAPES_URL, date=date, routeId=vehicle.route_id, tripId=vehicle.trip_id
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    return None
                raise
            geometry = LineGeometry.model_validate(payload)
            if len(geometry.coordinates) < 2:
                return None
            if any(
                not (-180 <= lon <= 180 and -90 <= lat <= 90) for lon, lat in geometry.coordinates
            ):
                raise ValueError("Invalid route coordinates")
            return RouteFeature(
                geometry=geometry,
                properties={"date": date, "route_id": vehicle.route_id, "trip_id": vehicle.trip_id},
            )

        return await self._shapes.get((date, vehicle.route_id, vehicle.trip_id), 21600, load)

    async def _stops(self, vehicle: RawVehicle, date: str) -> list[dict]:
        by_id, order = await asyncio.gather(
            self._stop_catalog(date),
            self._daily(STOP_ORDER_URL, date, "stopsInTrip"),
        )
        # ponytail: scan the day's variants per selection; index by route/trip if traffic grows.
        entries = [
            entry
            for entry in order
            if entry.get("routeId") == vehicle.route_id
            and entry.get("tripId") == vehicle.trip_id
            and entry.get("passenger") is not False
        ]
        return [
            by_id[entry["stopId"]]
            for entry in sorted(entries, key=lambda entry: entry["stopSequence"])
            if entry["stopId"] in by_id
        ]

    async def _predictions(
        self, vehicle: RawVehicle, stops: list[RouteStop], now: datetime
    ) -> tuple[list[tuple[datetime, datetime] | None], str]:
        """Return (estimated time, prediction timestamp) per stop in trip order, and a status."""
        estimates: list[tuple[datetime, datetime] | None] = [None] * len(stops)
        if not is_fresh(vehicle.timestamp, now):
            return estimates, "stale"
        # A vehicle can run the same variant again later. Never borrow that trip's prediction.
        if vehicle.scheduled_trip_start_time is None:
            return estimates, "unavailable"
        if not stops:
            return estimates, "unavailable"
        payload = await self._departures.get("all", 20, lambda: self._json(DEPARTURES_URL))
        stale_match, used = False, set()
        for index, stop in enumerate(stops):
            board = payload.get(str(stop.stop_id), {})
            for departure in board.get("departures", []):
                if (
                    id(departure) in used
                    or departure.get("vehicleId") != vehicle.vehicle_id
                    or departure.get("routeId") != vehicle.route_id
                    or departure.get("tripId") != vehicle.trip_id
                    or departure.get("status") != "REALTIME"
                    or parse_time(departure.get("scheduledTripStartTime"))
                    != vehicle.scheduled_trip_start_time
                ):
                    continue
                estimated = parse_time(departure.get("estimatedTime"))
                updated = parse_time(departure.get("timestamp"))
                board_updated = parse_time(board.get("lastUpdate"))
                if not updated or not board_updated:
                    continue
                if not is_fresh(updated, now) or not is_fresh(board_updated, now):
                    stale_match = True
                    continue
                if estimated and (now - estimated).total_seconds() <= 45:
                    estimates[index] = (estimated, updated)
                    # A looping trip serves one stop twice; each visit takes its own departure.
                    used.add(id(departure))
                    break
        if any(estimates):
            return estimates, "available"
        return estimates, "stale" if stale_match else "unavailable"

    async def get_journey(self, vehicle: RawVehicle, now: datetime | None = None) -> VehicleJourney:
        now = now or datetime.now(UTC)
        date = now.astimezone(WARSAW).date().isoformat()
        result = VehicleJourney(
            vehicle_id=vehicle.vehicle_id,
            route_id=vehicle.route_id,
            trip_id=vehicle.trip_id,
        )
        if vehicle.route_id is None or vehicle.trip_id is None:
            return result

        coordinates: list[tuple[float, float] | None] = []

        async def load_prediction() -> tuple[list[tuple[datetime, datetime] | None], str]:
            records = await self._stops(vehicle, date)
            stops = [
                RouteStop(stop_id=stop["stopId"], name=stop["stopName"], code=stop.get("stopCode"))
                for stop in records
            ]
            coordinates.extend(stop_coordinates(stop) for stop in records)
            result.stop_ids = [stop.stop_id for stop in stops]
            result.stops = [JourneyStop(**stop.model_dump()) for stop in stops]
            return await self._predictions(vehicle, stops, now)

        # Geometry remains usable if the stop catalog or prediction feed is unavailable.
        route, prediction = await asyncio.gather(
            self._route(vehicle, date), load_prediction(), return_exceptions=True
        )
        if isinstance(route, BaseException):
            if isinstance(route, asyncio.CancelledError):
                raise route
            logger.warning("route fetch failed: %s", route)
            result.route_status = "error"
        elif route:
            result.route = route
            result.route_status = "available"
        if result.route and result.stops and is_fresh(vehicle.timestamp, now):
            passed = passed_stops(
                result.route.geometry.coordinates,
                coordinates,
                (vehicle.lon, vehicle.lat),
                vehicle.direction,
            )
            for stop, flag in zip(result.stops, passed or [], strict=False):
                stop.passed = flag
        if isinstance(prediction, BaseException):
            if isinstance(prediction, asyncio.CancelledError):
                raise prediction
            logger.warning("prediction fetch failed: %s", prediction)
            result.prediction_status = "error"
        else:
            estimates, result.prediction_status = prediction
            for stop, estimate in zip(result.stops or [], estimates, strict=True):
                if estimate and (estimate[0] >= now or stop.passed is False):
                    stop.estimated_time = estimate[0]
                    if result.next_stop is None:
                        result.next_stop = NextStop(
                            stop=RouteStop(**stop.model_dump(include=set(RouteStop.model_fields))),
                            estimated_time=estimate[0],
                            prediction_updated_at=estimate[1],
                        )
        if result.prediction_status == "available" and result.next_stop is None:
            result.prediction_status = "unavailable"
        return result
