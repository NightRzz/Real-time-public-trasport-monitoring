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
from app.live import LiveFeed
from app.poller import GpsPoller
from app.recorder import FixRecorder
from app.store import VehicleStore
from app.sync import follow_snapshots
from app.ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    broker = await create_broker(settings.redis_url)
    client = GdanskClient(timeout=settings.gdansk_api_timeout_seconds)
    store = VehicleStore()
    recorder = FixRecorder(settings.database_url) if settings.database_url else None
    poller = GpsPoller(
        client,
        store,
        interval=settings.poll_interval_seconds,
        broker=broker,
        recorder=recorder,
    )
    journeys = JourneyService(timeout=settings.gdansk_api_timeout_seconds, broker=broker)
    live = LiveFeed(
        store,
        journeys.get_track,
        tick_seconds=settings.live_tick_seconds,
        overview_seconds=settings.overview_interval_seconds,
        detail_min_zoom=settings.detail_min_zoom,
        snap_max_distance=settings.snap_max_distance_m,
        interpolation_mode=settings.interpolation_mode,
    )
    app.state.store = store
    app.state.journeys = journeys
    app.state.live = live
    follower = asyncio.create_task(follow_snapshots(broker, store))
    poller.start()
    live.start()
    try:
        yield
    finally:
        await live.stop()
        await poller.stop()
        follower.cancel()
        await asyncio.gather(follower, return_exceptions=True)
        await client.close()
        await journeys.close()
        await broker.close()
        if recorder is not None:
            await recorder.close()


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
app.include_router(ws_router)


@app.get("/health", tags=["system"], summary="Health check")
async def health() -> dict[str, str]:
    return {"status": "ok"}
