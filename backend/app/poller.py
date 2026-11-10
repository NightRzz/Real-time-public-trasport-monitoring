import asyncio
import logging
import time
from datetime import datetime
from uuid import uuid4

from app.broker import Broker
from app.gdansk_client import GdanskApiError, GdanskClient
from app.models import RawVehicle
from app.store import (
    SNAPSHOT_CHANNEL,
    SNAPSHOT_KEY,
    SNAPSHOT_TTL_SECONDS,
    VehicleStore,
    encode_snapshot,
)

logger = logging.getLogger(__name__)

LEADER_KEY = "poller:leader"
LEADER_TTL_SECONDS = 15.0


class GpsPoller:
    def __init__(
        self,
        client: GdanskClient,
        store: VehicleStore,
        interval: float = 1.0,
        broker: Broker | None = None,
        owner: str | None = None,
    ) -> None:
        self._client = client
        self._store = store
        self._broker = broker
        self._owner = owner or uuid4().hex
        self._interval = interval
        self._task: asyncio.Task | None = None
        self._unchanged_since: float | None = None
        self._sleep_until = 0.0
        self._delayed = False

    async def poll_once(self) -> None:
        if self._unchanged_since is None:
            self._unchanged_since = time.monotonic()
        try:
            data = await self._client.fetch_positions()
        except GdanskApiError:
            logger.warning("poll failed, keeping previous data")
            return
        if self._store.last_update is not None and data.last_update <= self._store.last_update:
            return
        self._store.update(data.vehicles, data.last_update)
        await self._share(data.vehicles, data.last_update)
        now = time.monotonic()
        self._unchanged_since = now
        self._sleep_until = now + 16.0
        if self._delayed:
            logger.info("source updates resumed")
        self._delayed = False
        logger.info("fetched %d vehicles (lastUpdate=%s)", len(data.vehicles), data.last_update)

    async def _share(self, vehicles: list[RawVehicle], last_update: datetime) -> None:
        if self._broker is None:
            return
        try:
            encoded = encode_snapshot(vehicles, last_update)
            await self._broker.set(SNAPSHOT_KEY, encoded, SNAPSHOT_TTL_SECONDS)
            await self._broker.publish(SNAPSHOT_CHANNEL, encoded)
        except Exception:
            logger.exception("could not share snapshot through broker")

    async def is_leader(self) -> bool:
        if self._broker is None:
            return True
        try:
            return await self._broker.acquire(LEADER_KEY, self._owner, LEADER_TTL_SECONDS)
        except Exception:
            logger.exception("leader lock unavailable, polling locally")
            return True

    def _next_delay(self, started: float, now: float) -> float:
        delayed = self._unchanged_since is not None and now - self._unchanged_since >= 30.0
        if delayed and not self._delayed:
            logger.warning("source data delayed: no update for at least 30 seconds")
        self._delayed = delayed
        interval = max(5.0, self._interval) if delayed else self._interval
        return max(0.0, self._sleep_until - now, started + interval - now)

    async def _run(self) -> None:
        while True:
            started = time.monotonic()
            try:
                if await self.is_leader():
                    await self.poll_once()
            except Exception:
                logger.exception("unexpected error while polling, will retry")
            await asyncio.sleep(self._next_delay(started, time.monotonic()))

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("poller task crashed")
        self._task = None
