from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

VehicleType = Literal["bus", "tram"]


class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class VehicleProperties(BaseModel):
    vehicle_id: int
    vehicle_code: str | None = None
    route_id: int | None = None
    trip_id: int | None = None
    scheduled_trip_start_time: datetime | None = None
    line: str
    type: VehicleType
    headsign: str | None = None
    speed: float | None = None
    direction: float | None = None
    delay: int | None = None
    timestamp: datetime


class LineGeometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]]


class RouteFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: LineGeometry
    properties: dict[str, str | int]


class RouteStop(BaseModel):
    stop_id: int
    name: str
    code: str | None = None


class StopProperties(RouteStop):
    type: Literal["bus", "tram", "bus_tram"]


class StopFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: int
    geometry: PointGeometry
    properties: StopProperties


class StopFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[StopFeature]


class StopArrival(BaseModel):
    line: str
    type: VehicleType
    headsign: str
    time: datetime
    realtime: bool
    updated_at: datetime


class StopArrivals(BaseModel):
    arrivals: list[StopArrival] = []
    status: Literal["available", "unavailable", "stale"] = "unavailable"


class NextStop(BaseModel):
    stop: RouteStop
    estimated_time: datetime
    prediction_updated_at: datetime


class VehicleJourney(BaseModel):
    vehicle_id: int
    route_id: int | None
    trip_id: int | None
    route: RouteFeature | None = None
    stop_ids: list[int] | None = None
    next_stop: NextStop | None = None
    route_status: Literal["available", "unavailable", "error"] = "unavailable"
    prediction_status: Literal["available", "unavailable", "stale", "error"] = "unavailable"


class VehicleFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: int
    geometry: PointGeometry
    properties: VehicleProperties


class VehicleFeatureCollection(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "id": 145704,
                        "geometry": {"type": "Point", "coordinates": [18.6059, 54.3235]},
                        "properties": {
                            "vehicle_id": 145704,
                            "line": "213",
                            "type": "bus",
                            "headsign": "Kowale Szkoła",
                            "speed": 0,
                            "direction": 315,
                            "delay": 21,
                            "timestamp": "2026-09-28T12:00:01Z",
                        },
                    }
                ],
                "last_update": "2026-09-28T12:00:05Z",
            }
        }
    )

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[VehicleFeature]
    last_update: datetime | None = None
