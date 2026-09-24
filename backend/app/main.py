import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.gdansk_client import GdanskClient
from app.poller import GpsPoller

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    client = GdanskClient(timeout=settings.gdansk_api_timeout_seconds)
    poller = GpsPoller(client, interval=settings.poll_interval_seconds)
    app.state.poller = poller
    poller.start()
    yield
    await poller.stop()
    await client.close()


app = FastAPI(title="Gdansk Transport API", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
