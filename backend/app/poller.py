import asyncio
import logging

from app.gdansk_client import GdanskApiError, GdanskClient
from app.store import VehicleStore

logger = logging.getLogger(__name__)


class GpsPoller:
    def __init__(self, client: GdanskClient, store: VehicleStore, interval: float = 12.0) -> None:
        self._client = client
        self._store = store
        self._interval = interval
        self._task: asyncio.Task | None = None

    async def poll_once(self) -> None:
        try:
            data = await self._client.fetch_positions()
        except GdanskApiError:
            logger.warning("poll failed, keeping previous data")
            return
        self._store.update(data.vehicles, data.last_update)
        logger.info("fetched %d vehicles (lastUpdate=%s)", len(data.vehicles), data.last_update)

    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            started = loop.time()
            try:
                await self.poll_once()
            except Exception:
                logger.exception("unexpected error while polling, will retry")
            await asyncio.sleep(max(0.0, self._interval - (loop.time() - started)))

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
