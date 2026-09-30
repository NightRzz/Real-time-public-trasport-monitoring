import logging

import httpx
from pydantic import ValidationError

from app.models import GpsPositionsResponse
from app.parser import parse_positions

logger = logging.getLogger(__name__)

GPS_POSITIONS_URL = "https://ckan2.multimediagdansk.pl/gpsPositions"


class GdanskApiError(Exception):
    pass


class GdanskClient:
    def __init__(self, base_url: str = GPS_POSITIONS_URL, timeout: float = 5.0) -> None:
        self._url = base_url
        self._client = httpx.AsyncClient(timeout=timeout)

    async def fetch_positions(self) -> GpsPositionsResponse:
        try:
            response = await self._client.get(self._url, params={"v": 2})
            response.raise_for_status()
            return parse_positions(response.json())
        except httpx.TimeoutException as exc:
            logger.warning("gdansk api timeout: %s", exc)
            raise GdanskApiError("timeout") from exc
        except (httpx.HTTPError, ValidationError, KeyError, ValueError) as exc:
            logger.warning("gdansk api error: %s", exc)
            raise GdanskApiError(str(exc)) from exc

    async def close(self) -> None:
        await self._client.aclose()
