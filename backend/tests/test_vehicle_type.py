import pytest

from app.vehicle_type import detect_vehicle_type


@pytest.mark.parametrize("line", ["2", "3", "8", "10", "12"])
def test_tram_lines(line):
    assert detect_vehicle_type(line) == "tram"


@pytest.mark.parametrize("line", ["1", "13", "111", "213", "N1", "T8", "M32", "106"])
def test_bus_lines(line):
    assert detect_vehicle_type(line) == "bus"
