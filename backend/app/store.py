from dataclasses import dataclass, field
from datetime import datetime

from app.models import RawVehicle


@dataclass
class VehicleStore:
    vehicles: list[RawVehicle] = field(default_factory=list)
    last_update: datetime | None = None

    def update(self, vehicles: list[RawVehicle], last_update: datetime) -> None:
        self.vehicles = list(vehicles)
        self.last_update = last_update

    def snapshot(self) -> tuple[list[RawVehicle], datetime | None]:
        return self.vehicles, self.last_update
