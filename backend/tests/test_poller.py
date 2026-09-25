import asyncio

from app.gdansk_client import GdanskApiError
from app.models import GpsPositionsResponse
from app.poller import GpsPoller
from app.store import VehicleStore
from tests.test_models import SAMPLE


class FakeClient:
    def __init__(self, responses):
        self._responses = list(responses)

    async def fetch_positions(self):
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def test_poll_once_stores_latest():
    data = GpsPositionsResponse.model_validate(SAMPLE)
    store = VehicleStore()
    poller = GpsPoller(FakeClient([data]), store)

    asyncio.run(poller.poll_once())

    assert store.vehicles == data.vehicles
    assert store.last_update == data.last_update


def test_poll_error_keeps_previous_data():
    data = GpsPositionsResponse.model_validate(SAMPLE)
    store = VehicleStore()
    poller = GpsPoller(FakeClient([data, GdanskApiError("timeout")]), store)

    asyncio.run(poller.poll_once())
    asyncio.run(poller.poll_once())

    assert len(store.vehicles) == 1
    assert store.last_update == data.last_update


class CountingClient:
    def __init__(self, error: Exception):
        self.calls = 0
        self._error = error

    async def fetch_positions(self):
        self.calls += 1
        raise self._error


def test_loop_survives_unexpected_error():
    async def scenario():
        client = CountingClient(TypeError("bad payload"))
        poller = GpsPoller(client, VehicleStore(), interval=0.01)
        poller.start()
        await asyncio.sleep(0.1)
        await poller.stop()
        return client.calls

    assert asyncio.run(scenario()) > 1


def test_stop_is_safe_when_not_started():
    asyncio.run(GpsPoller(CountingClient(TypeError()), VehicleStore()).stop())
