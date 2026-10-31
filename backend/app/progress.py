"""Place stops and a vehicle along a trip shape to tell which stops are behind it."""

from itertools import dropwhile, pairwise, takewhile
from math import atan2, cos, degrees, hypot, radians

Point = tuple[float, float]

# Planar metres around Gdansk; the distortion across the Tricity is far below a stop spacing.
METRES_X, METRES_Y = 111_320 * cos(radians(54.4)), 110_574
MAX_OFFSET = 100  # metres from the shape before the vehicle is treated as off this route
TOLERANCE = 20  # metres; where a shape passes a point twice, the earlier pass wins


def _xy(point: Point) -> Point:
    return point[0] * METRES_X, point[1] * METRES_Y


def locate(
    line: list[Point], point: Point, start: float = 0.0, heading: float | None = None
) -> tuple[float, float] | None:
    """Return (metres along the line, metres off the line) of the nearest position after start."""
    px, py = _xy(point)
    candidates, matching, travelled = [], [], 0.0
    for (ax, ay), (bx, by) in pairwise(map(_xy, line)):
        dx, dy = bx - ax, by - ay
        length = hypot(dx, dy)
        if length and travelled + length >= start:
            low = max(0.0, (start - travelled) / length)
            t = min(1.0, max(low, ((px - ax) * dx + (py - ay) * dy) / length**2))
            candidate = (travelled + t * length, hypot(ax + t * dx - px, ay + t * dy - py))
            candidates.append(candidate)
            turn = None if heading is None else (degrees(atan2(dx, dy)) - heading + 180) % 360 - 180
            if turn is not None and abs(turn) < 90:
                matching.append(candidate)
        travelled += length
    pool = matching or candidates
    if not pool:
        return None
    limit = min(offset for _, offset in pool) + TOLERANCE
    first_pass = takewhile(lambda c: c[1] <= limit, dropwhile(lambda c: c[1] > limit, pool))
    return min(first_pass, key=lambda c: c[1])


def passed_stops(
    line: list[Point], stops: list[Point | None], vehicle: Point, heading: float | None
) -> list[bool] | None:
    """Flag stops the vehicle has left behind, or None when its position on the shape is unknown."""
    found = locate(line, vehicle, heading=heading)
    if found is None or found[1] > MAX_OFFSET or None in stops:
        return None
    result, along = [], 0.0
    for stop in stops:
        placed = locate(line, stop, start=along)
        if placed is None:
            return None
        along = placed[0]
        result.append(along < found[0] - TOLERANCE)
    return result
