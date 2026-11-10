import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router
from app.broker import create_broker
from app.config import get_settings
from app.gdansk_client import GdanskClient
from app.journeys import JourneyService
from app.poller import GpsPoller
from app.store import VehicleStore
from app.sync import follow_snapshots

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    broker = await create_broker(settings.redis_url)
    client = GdanskClient(timeout=settings.gdansk_api_timeout_seconds)
    store = VehicleStore()
    poller = GpsPoller(client, store, interval=settings.poll_interval_seconds, broker=broker)
    journeys = JourneyService(timeout=settings.gdansk_api_timeout_seconds)
    app.state.store = store
    app.state.journeys = journeys
    follower = asyncio.create_task(follow_snapshots(broker, store))
    poller.start()
    try:
        yield
    finally:
        await poller.stop()
        follower.cancel()
        await asyncio.gather(follower, return_exceptions=True)
        await client.close()
        await journeys.close()
        await broker.close()


app = FastAPI(
    title="Gdansk Transport API",
    description="Live positions of public transport vehicles in Gdansk.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.get("/health", tags=["system"], summary="Health check")
async def health() -> dict[str, str]:
    return {"status": "ok"}
