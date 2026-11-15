import logging
from collections.abc import Callable
from datetime import datetime
from time import monotonic
from typing import Any

import asyncpg

from app.models import RawVehicle

logger = logging.getLogger(__name__)

RETRY_SECONDS = 30.0

SCHEMA = """
create table if not exists gps_fixes (
    vehicle_id integer not null,
    generated timestamptz not null,
    received_at timestamptz not null,
    line text not null,
    route_id integer,
    trip_id integer,
    scheduled_trip_start_time timestamptz,
    vehicle_code text,
    headsign text,
    lat double precision not null,
    lon double precision not null,
    speed real,
    direction real,
    delay integer,
    primary key (vehicle_id, generated)
);
create index if not exists gps_fixes_trip_idx on gps_fixes (route_id, trip_id, generated);
create index if not exists gps_fixes_generated_idx on gps_fixes (generated);
"""

INSERT = """
insert into gps_fixes (
    vehicle_id, generated, received_at, line, route_id, trip_id, scheduled_trip_start_time,
    vehicle_code, headsign, lat, lon, speed, direction, delay
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
on conflict do nothing
"""


class FixRecorder:
    def __init__(self, url: str, connect: Callable[..., Any] = asyncpg.create_pool) -> None:
        self._url = url
        self._connect = connect
        self._pool: Any = None
        self._retry_at = 0.0
        self._last: dict[int, datetime] = {}

    async def _ready(self) -> bool:
        if self._pool is not None:
            return True
        if monotonic() < self._retry_at:
            return False
        try:
            pool = await self._connect(self._url, min_size=1, max_size=2, timeout=5)
            async with pool.acquire() as connection:
                await connection.execute(SCHEMA)
        except Exception as exc:
            logger.warning("gps recording database unavailable: %s", exc)
            self._retry_at = monotonic() + RETRY_SECONDS
            return False
        self._pool = pool
        logger.info("recording gps fixes to database")
        return True

    async def record(self, vehicles: list[RawVehicle], received_at: datetime) -> int:
        fresh = [v for v in vehicles if self._last.get(v.vehicle_id) != v.timestamp]
        if not fresh or not await self._ready():
            return 0
        rows = [
            (
                v.vehicle_id,
                v.timestamp,
                received_at,
                v.line,
                v.route_id,
                v.trip_id,
                v.scheduled_trip_start_time,
                v.vehicle_code,
                v.headsign,
                v.lat,
                v.lon,
                v.speed,
                v.direction,
                v.delay,
            )
            for v in fresh
        ]
        try:
            async with self._pool.acquire() as connection:
                await connection.executemany(INSERT, rows)
        except Exception as exc:
            logger.warning("could not record gps fixes: %s", exc)
            return 0
        for v in fresh:
            self._last[v.vehicle_id] = v.timestamp
        return len(rows)

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
