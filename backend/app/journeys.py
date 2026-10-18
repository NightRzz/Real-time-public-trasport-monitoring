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
from app.schemas import LineGeometry, NextStop, RouteFeature, RouteStop, VehicleJourney

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

    async def _stops(self, vehicle: RawVehicle, date: str) -> list[RouteStop]:
        stops, order = await asyncio.gather(
            self._daily(STOPS_URL, date, "stops"),
            self._daily(STOP_ORDER_URL, date, "stopsInTrip"),
        )
        by_id = {stop["stopId"]: stop for stop in stops}
        result = []
        # ponytail: scan the day's variants per selection; index by route/trip if traffic grows.
        entries = [
            entry
            for entry in order
            if entry.get("routeId") == vehicle.route_id
            and entry.get("tripId") == vehicle.trip_id
            and entry.get("passenger") is not False
        ]
        for entry in sorted(entries, key=lambda entry: entry["stopSequence"]):
            stop = by_id.get(entry["stopId"])
            if not stop or stop.get("nonpassenger") or stop.get("virtual") or stop.get("depot"):
                continue
            result.append(
                RouteStop(
                    stop_id=stop["stopId"],
                    name=stop["stopName"],
                    code=stop.get("stopCode"),
                )
            )
        return result

    async def _next_stop(
        self, vehicle: RawVehicle, date: str, now: datetime
    ) -> tuple[NextStop | None, str]:
        if not is_fresh(vehicle.timestamp, now):
            return None, "stale"
        # A vehicle can run the same variant again later. Never borrow that trip's prediction.
        if vehicle.scheduled_trip_start_time is None:
            return None, "unavailable"
        stops = await self._stops(vehicle, date)
        if not stops:
            return None, "unavailable"
        payload = await self._departures.get("all", 20, lambda: self._json(DEPARTURES_URL))
        stale_match = False
        # ponytail: incomplete boards reveal only the next available prediction, not route progress.
        # Keep published stop order; GPS map matching would be needed to identify unreported stops.
        for stop in stops:
            board = payload.get(str(stop.stop_id), {})
            for departure in board.get("departures", []):
                if (
                    departure.get("vehicleId") != vehicle.vehicle_id
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
                if estimated and estimated >= now:
                    return NextStop(
                        stop=stop, estimated_time=estimated, prediction_updated_at=updated
                    ), "available"
        return None, "stale" if stale_match else "unavailable"

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
        # Geometry remains usable if the stop catalog or prediction feed is unavailable.
        route, prediction = await asyncio.gather(
            self._route(vehicle, date), self._next_stop(vehicle, date, now), return_exceptions=True
        )
        if isinstance(route, BaseException):
            if isinstance(route, asyncio.CancelledError):
                raise route
            logger.warning("route fetch failed: %s", route)
            result.route_status = "error"
        elif route:
            result.route = route
            result.route_status = "available"
        if isinstance(prediction, BaseException):
            if isinstance(prediction, asyncio.CancelledError):
                raise prediction
            logger.warning("prediction fetch failed: %s", prediction)
            result.prediction_status = "error"
        else:
            result.next_stop, result.prediction_status = prediction
        return result
