import asyncio
from datetime import UTC, datetime

from app.models import GpsPositionsResponse
from app.recorder import SCHEMA, FixRecorder
from tests.test_models import SAMPLE

RECEIVED = datetime(2026, 11, 12, 12, 0, 30, tzinfo=UTC)


class Connection:
    def __init__(self, log, fail):
        self.log, self.fail = log, fail

    async def execute(self, sql):
        self.log.append(("execute", sql))

    async def executemany(self, sql, rows):
        if self.fail:
            raise OSError("disk full")
        self.log.append(("insert", rows))


class Acquire:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, *exc):
        return False


class Pool:
    def __init__(self, log, fail=False):
        self.connection = Connection(log, fail)
        self.closed = False

    def acquire(self):
        return Acquire(self.connection)

    async def close(self):
        self.closed = True


def vehicles():
    return GpsPositionsResponse.model_validate(SAMPLE).vehicles


def test_records_only_new_fixes_and_creates_schema():
    log = []

    async def connect(url, **options):
        assert url == "postgresql://db"
        return Pool(log)

    async def scenario():
        recorder = FixRecorder("postgresql://db", connect)
        first = await recorder.record(vehicles(), RECEIVED)
        again = await recorder.record(vehicles(), RECEIVED)
        await recorder.close()
        return first, again

    assert asyncio.run(scenario()) == (1, 0)
    assert log[0] == ("execute", SCHEMA)
    row = log[1][1][0]
    assert row[0] == 145704
    assert row[2] == RECEIVED
    assert row[3] == "213"


def test_unavailable_database_is_retried_later_without_crashing():
    calls = []

    async def connect(url, **options):
        calls.append(url)
        raise ConnectionRefusedError("no db")

    async def scenario():
        recorder = FixRecorder("postgresql://db", connect)
        return await recorder.record(vehicles(), RECEIVED), await recorder.record(
            vehicles(), RECEIVED
        )

    assert asyncio.run(scenario()) == (0, 0)
    assert len(calls) == 1


def test_failed_insert_is_retried_with_next_snapshot():
    log = []
    pool = Pool(log, fail=True)

    async def connect(url, **options):
        return pool

    async def scenario():
        recorder = FixRecorder("postgresql://db", connect)
        failed = await recorder.record(vehicles(), RECEIVED)
        pool.connection.fail = False
        return failed, await recorder.record(vehicles(), RECEIVED)

    assert asyncio.run(scenario()) == (0, 1)
