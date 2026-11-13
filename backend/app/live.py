import asyncio
import json
import logging
import math
from bisect import bisect_right
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from itertools import pairwise
from time import monotonic
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.geojson import vehicle_to_feature
from app.models import RawVehicle
from app.progress import _xy, locate
from app.store import VehicleStore

logger = logging.getLogger(__name__)

Point = tuple[float, float]
TrackLoader = Callable[[RawVehicle], Awaitable[tuple[list[Point], list[Point | None]] | None]]

MAX_LIVE_AGE_SECONDS = 90
STOP_TOLERANCE_M = 15.0
PATH_SECONDS = 3.0
MAX_PATH_M = 1500.0
MAX_STOP_OFFSET_M = 150.0
VIEWPORT_MARGIN = 0.3
TRACK_RETRY_SECONDS = 600.0
MAX_TRACK_LOADS = 5
SEND_TIMEOUT_SECONDS = 2.0
SCHEDULE_SLACK_SECONDS = 0.05
WARSAW = ZoneInfo("Europe/Warsaw")


@dataclass(frozen=True)
class Track:
    line: list[Point]
    cumulative: list[float]
    stop_alongs: list[float | None]

    @property
    def length(self) -> float:
        return self.cumulative[-1]

    @property
    def stops(self) -> list[float]:
        return [along for along in self.stop_alongs if along is not None]

    @classmethod
    def build(cls, line: list[Point], stops: list[Point | None]) -> "Track":
        cumulative = [0.0]
        for a, b in pairwise(map(_xy, line)):
            cumulative.append(cumulative[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        along, placed = 0.0, []
        for stop in stops:
            found = None if stop is None else locate(line, stop, start=along)
            if found is None or found[1] > MAX_STOP_OFFSET_M:
                placed.append(None)
                continue
            along = found[0]
            placed.append(along)
        return cls(line=line, cumulative=cumulative, stop_alongs=placed)

    def point_at(self, along: float) -> tuple[Point, float]:
        along = min(max(along, 0.0), self.length)
        index = min(max(bisect_right(self.cumulative, along) - 1, 0), len(self.line) - 2)
        start, end = self.cumulative[index], self.cumulative[index + 1]
        t = (along - start) / (end - start) if end > start else 0.0
        (ax, ay), (bx, by) = self.line[index], self.line[index + 1]
        (mx, my), (nx, ny) = _xy(self.line[index]), _xy(self.line[index + 1])
        bearing = math.degrees(math.atan2(nx - mx, ny - my)) % 360
        return (ax + (bx - ax) * t, ay + (by - ay) * t), bearing

    def slice(self, start: float, end: float) -> list[list[float]]:
        inner = [
            point
            for point, along in zip(self.line, self.cumulative, strict=True)
            if start < along < end
        ]
        points = [self.point_at(start)[0], *inner, self.point_at(end)[0]]
        return [[round(lon, 6), round(lat, 6)] for lon, lat in points]


@dataclass
class Fix:
    trip: tuple[Any, ...]
    timestamp: datetime
    along: float
    previous: tuple[datetime, float] | None
    seen_at: float


def trip_key(vehicle: RawVehicle) -> tuple[Any, ...]:
    return (vehicle.route_id, vehicle.trip_id, vehicle.scheduled_trip_start_time)


def track_key(vehicle: RawVehicle, now: datetime) -> tuple[Any, ...]:
    return (now.astimezone(WARSAW).date().isoformat(), vehicle.route_id, vehicle.trip_id)


def raw_feature(vehicle: RawVehicle) -> dict[str, Any]:
    feature = vehicle_to_feature(vehicle).model_dump(mode="json")
    lon, lat = feature["geometry"]["coordinates"]
    feature["geometry"]["coordinates"] = [round(lon, 6), round(lat, 6)]
    return feature


class Viewport(BaseModel):
    type: str = "viewport"
    bbox: tuple[float, float, float, float]
    zoom: float = Field(ge=0, le=24)

    @field_validator("bbox")
    @classmethod
    def ordered(cls, bbox: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
        west, south, east, north = bbox
        if not all(math.isfinite(v) for v in bbox) or west >= east or south >= north:
            raise ValueError("bbox must be [west, south, east, north]")
        return bbox


class Selection(BaseModel):
    type: str = "select"
    vehicle_id: int | None = None


class Watch(BaseModel):
    type: str = "watch"
    vehicle_ids: list[int] = Field(default_factory=list, max_length=50)


class Sender(Protocol):
    async def send_text(self, data: str) -> None: ...


@dataclass(eq=False)
class LiveClient:
    socket: Sender
    bbox: tuple[float, float, float, float] | None = None
    zoom: float | None = None
    selected: int | None = None
    watched: frozenset[int] = frozenset()
    next_send: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def contains(self, lon: float, lat: float) -> bool:
        if self.bbox is None:
            return True
        west, south, east, north = self.bbox
        dx, dy = (east - west) * VIEWPORT_MARGIN, (north - south) * VIEWPORT_MARGIN
        return west - dx <= lon <= east + dx and south - dy <= lat <= north + dy


class LiveFeed:
    def __init__(
        self,
        store: VehicleStore,
        load_track: TrackLoader,
        tick_seconds: float = 1.0,
        overview_seconds: float = 5.0,
        detail_min_zoom: float = 13.0,
        snap_max_distance: float = 75.0,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._store = store
        self._load_track = load_track
        self._tick = tick_seconds
        self._overview = overview_seconds
        self._detail_zoom = detail_min_zoom
        self._snap = snap_max_distance
        self._clock = clock
        self.clients: set[LiveClient] = set()
        self._tracks: dict[tuple[Any, ...], Track | None] = {}
        self._failed: dict[tuple[Any, ...], float] = {}
        self._loading: dict[tuple[Any, ...], asyncio.Task] = {}
        self._fixes: dict[int, Fix] = {}
        self._raw: tuple[int, dict[int, dict[str, Any]]] = (-1, {})
        self._limit = asyncio.Semaphore(MAX_TRACK_LOADS)
        self._task: asyncio.Task | None = None

    def detailed(self, client: LiveClient) -> bool:
        return client.zoom is not None and client.zoom >= self._detail_zoom

    def connect(self, socket: Sender) -> LiveClient:
        client = LiveClient(socket)
        self.clients.add(client)
        return client

    def disconnect(self, client: LiveClient) -> None:
        self.clients.discard(client)

    def handle(self, client: LiveClient, text: str) -> bool:
        try:
            message = json.loads(text)
            kind = message.get("type") if isinstance(message, dict) else None
            if kind == "viewport":
                viewport = Viewport.model_validate(message)
                client.bbox, client.zoom = viewport.bbox, viewport.zoom
            elif kind == "select":
                client.selected = Selection.model_validate(message).vehicle_id
            elif kind == "watch":
                client.watched = frozenset(Watch.model_validate(message).vehicle_ids)
            else:
                return False
        except (ValueError, ValidationError):
            return False
        client.next_send = 0.0
        return True

    def _raw_features(self, vehicles: list[RawVehicle]) -> dict[int, dict[str, Any]]:
        version = self._store.version
        if self._raw[0] != version:
            self._raw = (version, {v.vehicle_id: raw_feature(v) for v in vehicles})
        return self._raw[1]

    def _request_track(self, vehicle: RawVehicle, now: datetime) -> None:
        key = track_key(vehicle, now)
        if key in self._tracks or key in self._loading:
            return
        if self._failed.get(key, 0.0) > monotonic():
            return
        self._loading[key] = asyncio.create_task(self._fetch_track(key, vehicle))

    async def _fetch_track(self, key: tuple[Any, ...], vehicle: RawVehicle) -> None:
        try:
            async with self._limit:
                loaded = await self._load_track(vehicle)
            if loaded is None or len(loaded[0]) < 2:
                self._failed[key] = monotonic() + TRACK_RETRY_SECONDS
            else:
                self._tracks[key] = Track.build(*loaded)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("track load failed for %s: %s", key, exc)
            self._failed[key] = monotonic() + TRACK_RETRY_SECONDS
        finally:
            self._loading.pop(key, None)

    def _track(self, vehicle: RawVehicle, now: datetime) -> Track | None:
        age = (now - vehicle.timestamp).total_seconds()
        if vehicle.route_id is None or vehicle.trip_id is None or age > MAX_LIVE_AGE_SECONDS:
            return None
        track = self._tracks.get(track_key(vehicle, now))
        if track is None:
            self._request_track(vehicle, now)
        return track

    def _fix(self, vehicle: RawVehicle, track: Track) -> Fix | None:
        fix = self._fixes.get(vehicle.vehicle_id)
        trip = trip_key(vehicle)
        if fix is not None and fix.trip == trip and fix.timestamp == vehicle.timestamp:
            return fix
        found = locate(track.line, (vehicle.lon, vehicle.lat), heading=vehicle.direction)
        if found is None or found[1] > self._snap:
            self._fixes.pop(vehicle.vehicle_id, None)
            return None
        previous = None
        if fix is not None and fix.trip == trip and fix.timestamp < vehicle.timestamp:
            previous = (fix.timestamp, fix.along)
        fix = Fix(trip, vehicle.timestamp, found[0], previous, monotonic())
        self._fixes[vehicle.vehicle_id] = fix
        return fix

    def _snapped(self, vehicle: RawVehicle, track: Track, along: float) -> dict[str, Any]:
        (lon, lat), bearing = track.point_at(along)
        feature = raw_feature(vehicle)
        feature["geometry"]["coordinates"] = [round(lon, 6), round(lat, 6)]
        feature["properties"]["direction"] = round(bearing)
        feature["properties"]["snapped"] = True
        return feature

    def transition(self, vehicle: RawVehicle, now: datetime) -> dict[str, Any] | None:
        track = self._track(vehicle, now)
        fix = None if track is None else self._fix(vehicle, track)
        if track is None or fix is None:
            return None
        feature = self._snapped(vehicle, track, fix.along)
        if fix.previous is not None and monotonic() - fix.seen_at < PATH_SECONDS:
            start = fix.previous[1]
            if 0 < fix.along - start <= MAX_PATH_M:
                feature["properties"]["path"] = track.slice(start, fix.along)
        return feature

    def frame(self, client: LiveClient, now: datetime | None = None) -> dict[str, Any]:
        now = now or self._clock()
        vehicles, last_update = self._store.snapshot()
        raw = self._raw_features(vehicles)
        detailed = self.detailed(client)
        features = []
        for vehicle in vehicles:
            feature = raw.get(vehicle.vehicle_id)
            if feature is None:
                continue
            selected = vehicle.vehicle_id == client.selected
            watched = vehicle.vehicle_id in client.watched
            if not (selected or watched) and not client.contains(vehicle.lon, vehicle.lat):
                continue
            if detailed or selected:
                feature = self.transition(vehicle, now) or feature
            features.append(feature)
        return {
            "type": "vehicles",
            "last_update": last_update.isoformat() if last_update else None,
            "total": len(vehicles),
            "detailed": detailed,
            "features": features,
        }

    async def send(
        self, client: LiveClient, now: datetime | None = None, started: float | None = None
    ) -> None:
        started = monotonic() if started is None else started
        text = json.dumps(self.frame(client, now), separators=(",", ":"))
        interval = self._tick if self.detailed(client) else self._overview
        client.next_send = started + interval - SCHEDULE_SLACK_SECONDS
        async with client.lock:
            await asyncio.wait_for(client.socket.send_text(text), SEND_TIMEOUT_SECONDS)

    async def broadcast(self) -> None:
        now, current = self._clock(), monotonic()
        due = [client for client in self.clients if client.next_send <= current]
        results = await asyncio.gather(
            *(self.send(client, now, current) for client in due), return_exceptions=True
        )
        for client, result in zip(due, results, strict=True):
            if isinstance(result, Exception):
                logger.info("dropping live client: %s", result)
                self.disconnect(client)

    async def _run(self) -> None:
        while True:
            started = monotonic()
            try:
                await self.broadcast()
            except Exception:
                logger.exception("live broadcast failed")
            await asyncio.sleep(max(0.0, self._tick - (monotonic() - started)))

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        tasks = [t for t in (self._task, *self._loading.values()) if t is not None]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._task = None
        self._loading.clear()
