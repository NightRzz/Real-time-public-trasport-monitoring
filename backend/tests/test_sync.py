import asyncio

from app.broker import MemoryBroker
from app.models import GpsPositionsResponse
from app.store import SNAPSHOT_CHANNEL, SNAPSHOT_KEY, VehicleStore, encode_snapshot
from app.sync import follow_snapshots
from tests.test_models import SAMPLE


def test_follower_loads_cached_snapshot_and_live_updates():
    async def scenario():
        broker, store = MemoryBroker(), VehicleStore()
        data = GpsPositionsResponse.model_validate(SAMPLE)
        await broker.set(SNAPSHOT_KEY, encode_snapshot(data.vehicles, data.last_update))
        task = asyncio.create_task(follow_snapshots(broker, store))
        await asyncio.sleep(0.05)
        cached = store.last_update
        newer = data.last_update.replace(minute=5)
        await broker.publish(SNAPSHOT_CHANNEL, encode_snapshot(data.vehicles, newer))
        await broker.publish(SNAPSHOT_CHANNEL, "not json")
        await asyncio.sleep(0.05)
        task.cancel()
        return cached, store

    cached, store = asyncio.run(scenario())
    assert cached.minute == 0
    assert store.last_update.minute == 5
    assert [v.vehicle_id for v in store.vehicles] == [145704]


def test_store_apply_ignores_older_snapshots():
    data = GpsPositionsResponse.model_validate(SAMPLE)
    store = VehicleStore()

    assert store.apply(data.vehicles, data.last_update)
    assert not store.apply([], data.last_update)
    assert store.version == 1
