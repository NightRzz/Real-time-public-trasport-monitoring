import asyncio

from app.gdansk_client import GdanskApiError
from app.models import GpsPositionsResponse
from app.poller import GpsPoller
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
    poller = GpsPoller(FakeClient([data]))

    asyncio.run(poller.poll_once())

    assert poller.latest is data


def test_poll_error_keeps_previous_data():
    data = GpsPositionsResponse.model_validate(SAMPLE)
    poller = GpsPoller(FakeClient([data, GdanskApiError("timeout")]))

    asyncio.run(poller.poll_once())
    asyncio.run(poller.poll_once())

    assert poller.latest is data
