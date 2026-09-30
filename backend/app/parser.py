import logging
from datetime import datetime, timedelta
from typing import Any

from pydantic import TypeAdapter, ValidationError

from app.models import GpsPositionsResponse, RawVehicle, UtcDatetime

logger = logging.getLogger(__name__)

GDANSK_BBOX = (18.30, 54.15, 19.05, 54.60)
MAX_POSITION_AGE = timedelta(minutes=5)

_last_update_adapter = TypeAdapter(UtcDatetime)


def in_bbox(vehicle: RawVehicle, bbox: tuple[float, float, float, float] = GDANSK_BBOX) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= vehicle.lon <= max_lon and min_lat <= vehicle.lat <= max_lat


def is_stale(vehicle: RawVehicle, last_update: datetime) -> bool:
    return last_update - vehicle.timestamp > MAX_POSITION_AGE


def parse_positions(payload: Any) -> GpsPositionsResponse:
    if not isinstance(payload, dict):
        raise ValueError("gps payload is not a json object")
    last_update = _last_update_adapter.validate_python(payload.get("lastUpdate"))
    by_id: dict[int, RawVehicle] = {}
    rejected = 0
    for item in payload.get("vehicles") or []:
        try:
            vehicle = RawVehicle.model_validate(item)
        except ValidationError:
            rejected += 1
            continue
        if not in_bbox(vehicle) or is_stale(vehicle, last_update):
            rejected += 1
            continue
        current = by_id.get(vehicle.vehicle_id)
        if current is None or vehicle.timestamp > current.timestamp:
            by_id[vehicle.vehicle_id] = vehicle

    if rejected:
        logger.info("rejected %d invalid gps records", rejected)

    return GpsPositionsResponse(last_update=last_update, vehicles=list(by_id.values()))
