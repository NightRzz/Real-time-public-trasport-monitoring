import pytest
from pydantic import ValidationError

from app.parser import parse_positions
from tests.test_models import SAMPLE

BASE = SAMPLE["vehicles"][0]


def payload(*vehicles):
    return {"lastUpdate": SAMPLE["lastUpdate"], "vehicles": list(vehicles)}


def test_keeps_valid_vehicle():
    result = parse_positions(payload(BASE))

    assert [v.vehicle_id for v in result.vehicles] == [145704]


def test_drops_vehicle_outside_gdansk():
    warsaw = {**BASE, "vehicleId": 2, "lat": 52.23, "lon": 21.01}
    zero = {**BASE, "vehicleId": 3, "lat": 0, "lon": 0}

    result = parse_positions(payload(BASE, warsaw, zero))

    assert [v.vehicle_id for v in result.vehicles] == [145704]


def test_drops_broken_record_without_failing_whole_payload():
    broken = {**BASE, "vehicleId": 4, "lat": "abc"}
    missing = {k: v for k, v in BASE.items() if k != "lon"}

    result = parse_positions(payload(BASE, broken, missing))

    assert len(result.vehicles) == 1


def test_handles_empty_vehicle_list():
    assert parse_positions({"lastUpdate": SAMPLE["lastUpdate"], "vehicles": None}).vehicles == []


def test_drops_stale_position():
    stale = {**BASE, "vehicleId": 5, "generated": "2026-09-23T11:40:00Z"}

    result = parse_positions(payload(BASE, stale))

    assert [v.vehicle_id for v in result.vehicles] == [145704]


def test_keeps_newest_duplicate():
    older = {**BASE, "generated": "2026-09-23T11:59:30Z", "lat": 54.30}
    newer = {**BASE, "generated": "2026-09-23T12:00:01Z", "lat": 54.31}

    result = parse_positions(payload(newer, older))

    assert len(result.vehicles) == 1
    assert result.vehicles[0].lat == 54.31


def test_naive_timestamps_are_treated_as_utc():
    naive = {**BASE, "generated": "2026-09-23T12:00:01"}

    result = parse_positions({"lastUpdate": "2026-09-23T12:00:05", "vehicles": [naive]})

    assert len(result.vehicles) == 1
    assert result.vehicles[0].timestamp.tzinfo is not None
    assert result.last_update.tzinfo is not None


@pytest.mark.parametrize("last_update", [None, "yesterday"])
def test_invalid_last_update_raises_validation_error(last_update):
    with pytest.raises(ValidationError):
        parse_positions({"lastUpdate": last_update, "vehicles": [BASE]})


def test_non_object_payload_raises_value_error():
    with pytest.raises(ValueError):
        parse_positions([BASE])
