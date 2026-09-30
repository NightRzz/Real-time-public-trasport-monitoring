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
