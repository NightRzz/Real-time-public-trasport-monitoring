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


def test_adaptive_loop_three_cycles(monkeypatch):
    from datetime import timedelta

    import pytest

    clock, calls = [0.0], []
    data = GpsPositionsResponse.model_validate(SAMPLE)

    class PeriodicClient:
        async def fetch_positions(self):
            calls.append(clock[0])
            return data.model_copy(
                update={
                    "last_update": data.last_update + timedelta(seconds=20 * int(clock[0] // 20))
                }
            )

    async def sleep(delay):
        assert delay > 0
        clock[0] += delay
        if clock[0] >= 60:
            raise asyncio.CancelledError

    monkeypatch.setattr("app.poller.time.monotonic", lambda: clock[0])
    monkeypatch.setattr("app.poller.asyncio.sleep", sleep)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(GpsPoller(PeriodicClient(), VehicleStore())._run())
    assert calls == [0, 16, 17, 18, 19, 20, 36, 37, 38, 39, 40, 56, 57, 58, 59]


def test_duplicates_older_data_backoff_and_recovery(monkeypatch):
    from datetime import timedelta

    import pytest

    data = GpsPositionsResponse.model_validate(SAMPLE)
    older = data.model_copy(update={"last_update": data.last_update - timedelta(seconds=20)})
    newer = data.model_copy(update={"last_update": data.last_update + timedelta(seconds=40)})
    store = VehicleStore()
    poller = GpsPoller(FakeClient([data, data, older, GdanskApiError("timeout"), newer]), store)
    clock = [0.0]
    monkeypatch.setattr("app.poller.time.monotonic", lambda: clock[0])
    asyncio.run(poller.poll_once())
    original = store.vehicles
    assert poller._next_delay(0, 0) == 16
    assert poller._next_delay(16, 16.2) == pytest.approx(0.8)
    clock[0] = 20
    asyncio.run(poller.poll_once())
    clock[0] = 29
    asyncio.run(poller.poll_once())
    assert store.vehicles is original
    assert store.last_update == data.last_update
    assert poller._next_delay(29, 29) == 1
    clock[0] = 30
    asyncio.run(poller.poll_once())
    assert poller._next_delay(30, 31) == 4
    assert poller._delayed
    clock[0] = 40
    asyncio.run(poller.poll_once())
    assert not poller._delayed
    assert poller._next_delay(40, 40) == 16
    assert store.last_update == newer.last_update


def test_startup_errors_back_off(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr("app.poller.time.monotonic", lambda: clock[0])
    poller = GpsPoller(CountingClient(GdanskApiError("timeout")), VehicleStore())
    asyncio.run(poller.poll_once())
    assert poller._next_delay(0, 0) == 1
    clock[0] = 30
    asyncio.run(poller.poll_once())
    assert poller._next_delay(30, 30) == 5
