import asyncio
import logging

from app.broker import Broker
from app.store import SNAPSHOT_CHANNEL, SNAPSHOT_KEY, VehicleStore, decode_snapshot

logger = logging.getLogger(__name__)


async def follow_snapshots(broker: Broker, store: VehicleStore, retry_seconds: float = 2.0) -> None:
    while True:
        try:
            cached = await broker.get(SNAPSHOT_KEY)
            if cached is not None:
                store.apply(*decode_snapshot(cached[0]))
            async for message in broker.listen(SNAPSHOT_CHANNEL):
                try:
                    store.apply(*decode_snapshot(message))
                except (ValueError, KeyError, TypeError) as exc:
                    logger.warning("ignoring invalid snapshot message: %s", exc)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("snapshot subscription failed, retrying")
        await asyncio.sleep(retry_seconds)
