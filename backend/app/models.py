from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RawVehicle(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    vehicle_id: int = Field(alias="vehicleId")
    vehicle_code: str | None = Field(default=None, alias="vehicleCode")
    line: str = Field(alias="routeShortName")
    route_id: int | None = Field(default=None, alias="routeId")
    trip_id: int | None = Field(default=None, alias="tripId")
    headsign: str | None = None
    lat: float
    lon: float
    speed: float | None = None
    direction: float | None = None
    delay: int | None = None
    timestamp: datetime = Field(alias="generated")


class GpsPositionsResponse(BaseModel):
    last_update: datetime = Field(alias="lastUpdate")
    vehicles: list[RawVehicle]
