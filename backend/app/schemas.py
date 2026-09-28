from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

VehicleType = Literal["bus", "tram"]


class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class VehicleProperties(BaseModel):
    vehicle_id: int
    line: str
    type: VehicleType
    headsign: str | None = None
    speed: float | None = None
    direction: float | None = None
    delay: int | None = None
    timestamp: datetime


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
