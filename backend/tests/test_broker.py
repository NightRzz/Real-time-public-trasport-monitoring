import asyncio

import fakeredis
import pytest
from redis.asyncio import Redis

from app.broker import MemoryBroker, RedisBroker, create_broker


def memory():
    return MemoryBroker()


def redis():
    return RedisBroker(fakeredis.FakeAsyncRedis(decode_responses=True))


@pytest.fixture(params=[memory, redis], ids=["memory", "redis"])
def make_broker(request):
    return request.param


def test_set_get_with_ttl(make_broker):
    async def scenario():
        broker = make_broker()
        await broker.set("a", "1", ttl=60)
        await broker.set("b", "2")
        value, remaining = await broker.get("a")
        assert value == "1" and 0 < remaining <= 60
        assert await broker.get("b") == ("2", None)
        assert await broker.get("missing") is None
        await broker.close()

    asyncio.run(scenario())


def test_expired_value_is_gone(make_broker):
    async def scenario():
        broker = make_broker()
        await broker.set("a", "1", ttl=0.05)
        await asyncio.sleep(0.1)
        assert await broker.get("a") is None
        await broker.close()

    asyncio.run(scenario())


def test_publish_reaches_listener(make_broker):
    async def scenario():
        broker = make_broker()
        received = []

        async def listen():
            async for message in broker.listen("news"):
                received.append(message)
                return

        task = asyncio.create_task(listen())
        await asyncio.sleep(0.05)
        await broker.publish("news", "hello")
        await asyncio.wait_for(task, 2)
        await broker.close()
        return received

    assert asyncio.run(scenario()) == ["hello"]


def test_lock_has_single_owner_until_expiry(make_broker):
    async def scenario():
        broker = make_broker()
        assert await broker.acquire("leader", "a", ttl=0.1)
        assert await broker.acquire("leader", "a", ttl=0.1)
        assert not await broker.acquire("leader", "b", ttl=0.1)
        await asyncio.sleep(0.15)
        assert await broker.acquire("leader", "b", ttl=0.1)
        await broker.close()

    asyncio.run(scenario())


def test_create_broker_without_url_is_in_memory():
    assert isinstance(asyncio.run(create_broker(None)), MemoryBroker)


def test_create_broker_falls_back_when_redis_is_down(monkeypatch):
    async def refuse(self):
        raise ConnectionError("refused")

    monkeypatch.setattr(Redis, "ping", refuse)

    broker = asyncio.run(create_broker("redis://localhost:1/0"))

    assert isinstance(broker, MemoryBroker)
