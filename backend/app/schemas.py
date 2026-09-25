from datetime import datetime
from typing import Literal

from pydantic import BaseModel

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
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[VehicleFeature]
    last_update: datetime | None = None
