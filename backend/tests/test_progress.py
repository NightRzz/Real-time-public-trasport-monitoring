from app.progress import METRES_X, passed_stops


def east(metres: float, north: float = 0.0) -> tuple[float, float]:
    return 18.6 + metres / METRES_X, 54.35 + north / 110_574


def test_stops_behind_the_vehicle_are_passed():
    line = [east(0), east(1000)]
    stops = [east(0), east(300), east(600, north=15), east(1000)]
    assert passed_stops(line, stops, east(450), heading=90) == [True, True, False, False]
    # A vehicle standing at a stop has not left it yet.
    assert passed_stops(line, stops, east(305), heading=90) == [True, False, False, False]


def test_out_and_back_shape_uses_stop_order_and_heading():
    line = [east(0), east(1000), east(1000, north=10), east(0, north=10)]
    stops = [east(0), east(500), east(1000), east(500, north=10), east(0, north=10)]
    outbound = passed_stops(line, stops, east(700, north=8), heading=90)
    inbound = passed_stops(line, stops, east(700, north=8), heading=270)
    assert outbound == [True, True, False, False, False]
    assert inbound == [True, True, True, False, False]


def test_unknown_position():
    line = [east(0), east(1000)]
    assert passed_stops(line, [east(0)], east(500, north=500), heading=None) is None
    assert passed_stops(line, [east(0), None], east(500), heading=None) is None
