import json
from dataclasses import dataclass, field
from datetime import datetime

from app.models import RawVehicle

SNAPSHOT_KEY = "vehicles:snapshot"
SNAPSHOT_CHANNEL = "vehicles:updates"
SNAPSHOT_TTL_SECONDS = 600


@dataclass
class VehicleStore:
    vehicles: list[RawVehicle] = field(default_factory=list)
    last_update: datetime | None = None
    version: int = 0

    def update(self, vehicles: list[RawVehicle], last_update: datetime) -> None:
        self.vehicles = list(vehicles)
        self.last_update = last_update
        self.version += 1

    def apply(self, vehicles: list[RawVehicle], last_update: datetime) -> bool:
        if self.last_update is not None and last_update <= self.last_update:
            return False
        self.update(vehicles, last_update)
        return True

    def snapshot(self) -> tuple[list[RawVehicle], datetime | None]:
        return self.vehicles, self.last_update


def encode_snapshot(vehicles: list[RawVehicle], last_update: datetime) -> str:
    return json.dumps(
        {
            "lastUpdate": last_update.isoformat(),
            "vehicles": [v.model_dump(mode="json", by_alias=True) for v in vehicles],
        }
    )


def decode_snapshot(text: str) -> tuple[list[RawVehicle], datetime]:
    payload = json.loads(text)
    vehicles = [RawVehicle.model_validate(item) for item in payload["vehicles"]]
    return vehicles, datetime.fromisoformat(payload["lastUpdate"])
