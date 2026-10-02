import asyncio

import httpx
import pytest

from app.gdansk_client import GdanskApiError, GdanskClient
from tests.test_models import SAMPLE


def fetch_with(handler):
    async def run():
        client = GdanskClient(transport=httpx.MockTransport(handler))
        try:
            return await client.fetch_positions()
        finally:
            await client.close()

    return asyncio.run(run())


def test_parses_ok_response():
    def handler(request):
        assert request.url.params["v"] == "2"
        return httpx.Response(200, json=SAMPLE)

    result = fetch_with(handler)

    assert [v.vehicle_id for v in result.vehicles] == [145704]


def test_timeout_becomes_api_error():
    def handler(request):
        raise httpx.ReadTimeout("too slow", request=request)

    with pytest.raises(GdanskApiError, match="timeout"):
        fetch_with(handler)


@pytest.mark.parametrize("status", [500, 503])
def test_server_error_becomes_api_error(status):
    with pytest.raises(GdanskApiError):
        fetch_with(lambda request: httpx.Response(status))


def test_invalid_json_becomes_api_error():
    with pytest.raises(GdanskApiError):
        fetch_with(lambda request: httpx.Response(200, text="<html>maintenance</html>"))


@pytest.mark.parametrize(
    "body",
    [[SAMPLE], {"lastUpdate": None, "vehicles": []}, {"vehicles": []}],
)
def test_unexpected_payload_becomes_api_error(body):
    with pytest.raises(GdanskApiError):
        fetch_with(lambda request: httpx.Response(200, json=body))
