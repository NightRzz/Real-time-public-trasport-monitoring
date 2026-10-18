from fastapi import APIRouter, HTTPException, Request

from app.geojson import to_feature_collection
from app.schemas import VehicleFeatureCollection, VehicleJourney
from app.store import VehicleStore

router = APIRouter(prefix="/api", tags=["vehicles"])


def get_store(request: Request) -> VehicleStore:
    return request.app.state.store


@router.get(
    "/vehicles",
    response_model=VehicleFeatureCollection,
    summary="Current vehicle positions",
    description=(
        "Returns last known positions of ZTM Gdansk buses and trams as GeoJSON "
        "FeatureCollection (RFC 7946). Data comes from in-memory buffer refreshed "
        "every POLL_INTERVAL_SECONDS."
    ),
)
async def get_vehicles(request: Request) -> VehicleFeatureCollection:
    vehicles, last_update = get_store(request).snapshot()
    return to_feature_collection(vehicles, last_update)


@router.get("/vehicles/{vehicle_id}/journey", response_model=VehicleJourney)
async def get_vehicle_journey(vehicle_id: int, request: Request) -> VehicleJourney:
    vehicles, _ = get_store(request).snapshot()
    vehicle = next((v for v in vehicles if v.vehicle_id == vehicle_id), None)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle is no longer in the live feed")
    return await request.app.state.journeys.get_journey(vehicle)
