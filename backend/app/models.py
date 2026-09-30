from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def ensure_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


UtcDatetime = Annotated[datetime, AfterValidator(ensure_utc)]


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
    timestamp: UtcDatetime = Field(alias="generated")


class GpsPositionsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    last_update: UtcDatetime = Field(alias="lastUpdate")
    vehicles: list[RawVehicle]
