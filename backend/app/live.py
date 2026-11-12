import asyncio
import json
import logging
import math
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Protocol

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.geojson import vehicle_to_feature
from app.models import RawVehicle
from app.store import VehicleStore

logger = logging.getLogger(__name__)


VIEWPORT_MARGIN = 0.3
SEND_TIMEOUT_SECONDS = 2.0
SCHEDULE_SLACK_SECONDS = 0.05


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
        tick_seconds: float = 1.0,
        overview_seconds: float = 5.0,
        detail_min_zoom: float = 13.0,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._store = store
        self._tick = tick_seconds
        self._overview = overview_seconds
        self._detail_zoom = detail_min_zoom
        self._clock = clock
        self.clients: set[LiveClient] = set()
        self._raw: tuple[int, dict[int, dict[str, Any]]] = (-1, {})
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
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None
