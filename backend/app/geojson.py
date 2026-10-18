from datetime import datetime

from app.models import RawVehicle
from app.schemas import PointGeometry, VehicleFeature, VehicleFeatureCollection, VehicleProperties
from app.vehicle_type import detect_vehicle_type


def vehicle_to_feature(vehicle: RawVehicle) -> VehicleFeature:
    return VehicleFeature(
        id=vehicle.vehicle_id,
        geometry=PointGeometry(coordinates=(vehicle.lon, vehicle.lat)),
        properties=VehicleProperties(
            vehicle_id=vehicle.vehicle_id,
            vehicle_code=vehicle.vehicle_code,
            route_id=vehicle.route_id,
            trip_id=vehicle.trip_id,
            scheduled_trip_start_time=vehicle.scheduled_trip_start_time,
            line=vehicle.line,
            type=detect_vehicle_type(vehicle.line),
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
