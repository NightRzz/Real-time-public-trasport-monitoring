import httpx
from fastapi import APIRouter, HTTPException, Path, Request

from app.geojson import to_feature_collection
from app.schemas import (
    StopArrivals,
    StopFeatureCollection,
    VehicleFeatureCollection,
    VehicleJourney,
)
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


@router.get("/stops", response_model=StopFeatureCollection, tags=["stops"])
async def get_stops(request: Request) -> StopFeatureCollection:
    try:
        return await request.app.state.journeys.get_stops()
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Stop catalog unavailable") from exc


@router.get("/stops/{stop_id}/arrivals", response_model=StopArrivals, tags=["stops"])
async def get_stop_arrivals(request: Request, stop_id: int = Path(gt=0)) -> StopArrivals:
    try:
        return await request.app.state.journeys.get_stop_arrivals(stop_id)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Stop arrivals unavailable") from exc
