from datetime import datetime

from app.models import RawVehicle
from app.schemas import PointGeometry, VehicleFeature, VehicleFeatureCollection, VehicleProperties


def vehicle_to_feature(vehicle: RawVehicle) -> VehicleFeature:
    return VehicleFeature(
        id=vehicle.vehicle_id,
        geometry=PointGeometry(coordinates=(vehicle.lon, vehicle.lat)),
        properties=VehicleProperties(
            vehicle_id=vehicle.vehicle_id,
            line=vehicle.line,
            type="bus",
            headsign=vehicle.headsign,
            speed=vehicle.speed,
            direction=vehicle.direction,
            delay=vehicle.delay,
            timestamp=vehicle.timestamp,
        ),
    )


def to_feature_collection(
    vehicles: list[RawVehicle], last_update: datetime | None
) -> VehicleFeatureCollection:
    return VehicleFeatureCollection(
        features=[vehicle_to_feature(v) for v in vehicles],
        last_update=last_update,
    )
