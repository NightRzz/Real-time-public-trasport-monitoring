import asyncio
import logging
from collections.abc import AsyncIterator
from time import monotonic
from typing import Protocol

from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class Broker(Protocol):
    async def get(self, key: str) -> tuple[str, float | None] | None: ...

    async def set(self, key: str, value: str, ttl: float | None = None) -> None: ...

    async def publish(self, channel: str, message: str) -> None: ...

    def listen(self, channel: str) -> AsyncIterator[str]: ...

    async def acquire(self, name: str, owner: str, ttl: float) -> bool: ...

    async def close(self) -> None: ...


class MemoryBroker:
    def __init__(self) -> None:
        self._values: dict[str, tuple[str, float | None]] = {}
        self._queues: dict[str, set[asyncio.Queue[str]]] = {}
        self._locks: dict[str, tuple[str, float]] = {}

    async def get(self, key: str) -> tuple[str, float | None] | None:
        entry = self._values.get(key)
        if entry is None:
            return None
        value, expires = entry
        if expires is None:
            return value, None
        remaining = expires - monotonic()
        if remaining <= 0:
            del self._values[key]
            return None
        return value, remaining

    async def set(self, key: str, value: str, ttl: float | None = None) -> None:
        self._values[key] = (value, None if ttl is None else monotonic() + ttl)

    async def publish(self, channel: str, message: str) -> None:
        for queue in self._queues.get(channel, set()):
            queue.put_nowait(message)

    async def listen(self, channel: str) -> AsyncIterator[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        self._queues.setdefault(channel, set()).add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._queues[channel].discard(queue)

    async def acquire(self, name: str, owner: str, ttl: float) -> bool:
        holder = self._locks.get(name)
        if holder and holder[0] != owner and holder[1] > monotonic():
            return False
        self._locks[name] = (owner, monotonic() + ttl)
        return True

    async def close(self) -> None:
        self._queues.clear()


class RedisBroker:
    def __init__(self, client: Redis, prefix: str = "transport:") -> None:
        self._redis = client
        self._prefix = prefix

    @classmethod
    def from_url(cls, url: str) -> "RedisBroker":
        return cls(Redis.from_url(url, decode_responses=True))

    def _key(self, key: str) -> str:
        return self._prefix + key

    async def ping(self) -> None:
        await self._redis.ping()

    async def get(self, key: str) -> tuple[str, float | None] | None:
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.get(self._key(key))
            pipe.pttl(self._key(key))
            value, ttl_ms = await pipe.execute()
        if value is None:
            return None
        return value, ttl_ms / 1000 if ttl_ms and ttl_ms > 0 else None

    async def set(self, key: str, value: str, ttl: float | None = None) -> None:
        await self._redis.set(self._key(key), value, px=None if ttl is None else int(ttl * 1000))

    async def publish(self, channel: str, message: str) -> None:
        await self._redis.publish(self._key(channel), message)

    async def listen(self, channel: str) -> AsyncIterator[str]:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(self._key(channel))
        try:
            async for message in pubsub.listen():
                if message.get("type") == "message":
                    yield message["data"]
        finally:
            await pubsub.aclose()

    async def acquire(self, name: str, owner: str, ttl: float) -> bool:
        key, ttl_ms = self._key(name), int(ttl * 1000)
        if await self._redis.set(key, owner, nx=True, px=ttl_ms):
            return True
        if await self._redis.get(key) == owner:
            await self._redis.pexpire(key, ttl_ms)
            return True
        return False

    async def close(self) -> None:
        await self._redis.aclose()


async def create_broker(url: str | None) -> Broker:
    if not url:
        logger.info("REDIS_URL not set, using in-memory broker")
        return MemoryBroker()
    broker = RedisBroker.from_url(url)
    try:
        await broker.ping()
    except (RedisError, OSError) as exc:
        logger.error("redis unavailable at startup (%s), falling back to in-memory broker", exc)
        await broker.close()
        return MemoryBroker()
    logger.info("connected to redis")
    return broker
