from fastapi import APIRouter, Request

from app.geojson import to_feature_collection
from app.schemas import VehicleFeatureCollection
from app.store import VehicleStore

router = APIRouter(prefix="/api")


def get_store(request: Request) -> VehicleStore:
    return request.app.state.store


@router.get("/vehicles", response_model=VehicleFeatureCollection)
async def get_vehicles(request: Request) -> VehicleFeatureCollection:
    vehicles, last_update = get_store(request).snapshot()
    return to_feature_collection(vehicles, last_update)
