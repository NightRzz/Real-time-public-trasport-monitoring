import logging
from typing import Any

from pydantic import ValidationError

from app.models import GpsPositionsResponse, RawVehicle

logger = logging.getLogger(__name__)

GDANSK_BBOX = (18.30, 54.15, 19.05, 54.60)


def in_bbox(vehicle: RawVehicle, bbox: tuple[float, float, float, float] = GDANSK_BBOX) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= vehicle.lon <= max_lon and min_lat <= vehicle.lat <= max_lat


def parse_positions(payload: dict[str, Any]) -> GpsPositionsResponse:
    valid: list[RawVehicle] = []
    rejected = 0
    for item in payload.get("vehicles") or []:
        try:
            vehicle = RawVehicle.model_validate(item)
        except ValidationError:
            rejected += 1
            continue
        if not in_bbox(vehicle):
            rejected += 1
            continue
        valid.append(vehicle)

    if rejected:
        logger.info("rejected %d invalid gps records", rejected)

    return GpsPositionsResponse.model_validate(
        {"lastUpdate": payload["lastUpdate"], "vehicles": valid}
    )
