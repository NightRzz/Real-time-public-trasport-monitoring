import asyncio
import contextlib
import logging

from app.gdansk_client import GdanskApiError, GdanskClient
from app.models import GpsPositionsResponse

logger = logging.getLogger(__name__)


class GpsPoller:
    def __init__(self, client: GdanskClient, interval: float = 12.0) -> None:
        self._client = client
        self._interval = interval
        self._task: asyncio.Task | None = None
        self.latest: GpsPositionsResponse | None = None

    async def poll_once(self) -> None:
        try:
            data = await self._client.fetch_positions()
        except GdanskApiError:
            logger.warning("poll failed, keeping previous data")
            return
        self.latest = data
        logger.info("fetched %d vehicles (lastUpdate=%s)", len(data.vehicles), data.last_update)

    async def _run(self) -> None:
        while True:
            await self.poll_once()
            await asyncio.sleep(self._interval)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
