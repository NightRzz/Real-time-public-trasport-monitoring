"""Stop-aware damped route interpolation with elastic no-rewind catch-up."""

from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime
from math import exp
from typing import Any, NamedTuple


@dataclass(frozen=True)
class MotionConfig:
    gps_speed_weight: float = 0.6
    min_moving_speed_ms: float = 1.0  # 3.6 km/h; slower is treated as stationary
    max_speed_ms: float = 20.0  # 72 km/h upper bound for extrapolated urban transit
    decay_tau_s: float = 12.0  # exponential velocity decay time constant
    max_extrapolate_s: float = 25.0  # stop projecting further after 25 s without a fix
    max_fix_age_s: float = 50.0  # do not project fixes already older than this
    min_segment_dt_s: float = 3.0  # minimum gap between fixes to estimate realized speed
    stop_clearance_m: float = 15.0  # stops within 15 m ahead are treated as the current stop
    stop_brake_distance_m: float = 45.0  # C1 soft-braking distance into the upcoming stop
    catchup_seconds: float = 3.5  # elastic blend duration when a new fix is ahead of display
    max_hold_overshoot_m: float = 90.0  # hold instead of rewinding for small overshoots
    max_hold_seconds: float = 35.0  # reset if held longer than this without catch-up
    max_path_m: float = 1500.0


DEFAULT_MOTION = MotionConfig()


@dataclass
class MotionState:
    trip: tuple[Any, ...]
    fix_timestamp: datetime
    fix_along: float
    seen_at: datetime
    start_along: float
    v0_ms: float
    stop_cap: float
    floor_along: float | None = None
    hold_since: datetime | None = None
    last_eval_at: datetime | None = None
    last_along: float = 0.0
    prev_along: float = 0.0
    last_holding: bool = False


class TickEstimate(NamedTuple):
    along: float
    slice_start: float | None
    extrapolated: bool
    holding: bool


def _smoothstep(u: float) -> float:
    u = min(1.0, max(0.0, u))
    return u * u * (3.0 - 2.0 * u)


def next_stop_cap(
    along: float, stops: list[float], track_length: float, clearance_m: float = 15.0
) -> float:
    """Return distance of the next stop strictly ahead of along + clearance, or track_length."""
    if not stops:
        return track_length
    index = bisect_right(stops, along + clearance_m)
    if index >= len(stops):
        return track_length
    return min(stops[index], track_length)


def damped_advance(
    v0_ms: float, elapsed_s: float, room_m: float, cfg: MotionConfig = DEFAULT_MOTION
) -> float:
    """Return forward travel in metres with exponential speed decay and C1 braking into room_m."""
    if v0_ms <= 0.0 or elapsed_s <= 0.0 or room_m <= 0.0:
        return 0.0
    tau = min(elapsed_s, cfg.max_extrapolate_s)
    raw = v0_ms * cfg.decay_tau_s * (1.0 - exp(-tau / cfg.decay_tau_s))
    brake = min(cfg.stop_brake_distance_m, room_m)
    cruise_limit = room_m - brake
    if raw <= cruise_limit or brake <= 0.0:
        return min(raw, room_m)
    excess = raw - cruise_limit
    return cruise_limit + brake * (1.0 - exp(-excess / brake))


def fuse_speed(
    gps_speed_kmh: float | None,
    prev_fix: tuple[datetime, float] | None,
    fix_timestamp: datetime,
    fix_along: float,
    age_s: float,
    cfg: MotionConfig = DEFAULT_MOTION,
) -> float:
    """Fuse instantaneous GPS speed (km/h) with realized inter-fix speed into m/s."""
    if age_s > cfg.max_fix_age_s:
        return 0.0

    v_gps = None if gps_speed_kmh is None else max(0.0, gps_speed_kmh / 3.6)
    if v_gps is not None and v_gps < cfg.min_moving_speed_ms:
        return 0.0

    v_obs: float | None = None
    if prev_fix is not None:
        dt = (fix_timestamp - prev_fix[0]).total_seconds()
        ds = fix_along - prev_fix[1]
        if dt >= cfg.min_segment_dt_s and ds >= 0.0:
            v_obs = min(ds / dt, cfg.max_speed_ms)

    if v_gps is not None and v_obs is not None:
        v0 = cfg.gps_speed_weight * v_gps + (1.0 - cfg.gps_speed_weight) * v_obs
    elif v_gps is not None:
        v0 = v_gps
    elif v_obs is not None:
        v0 = v_obs
    else:
        return 0.0

    v0 = min(v0, cfg.max_speed_ms)
    return 0.0 if v0 < cfg.min_moving_speed_ms else v0


def _target_along(state: MotionState, now: datetime, cfg: MotionConfig = DEFAULT_MOTION) -> float:
    elapsed = max(0.0, (now - state.seen_at).total_seconds())
    room = max(0.0, state.stop_cap - state.fix_along)
    return state.fix_along + damped_advance(state.v0_ms, elapsed, room, cfg)


def estimate_along(state: MotionState, now: datetime, cfg: MotionConfig = DEFAULT_MOTION) -> float:
    """Pure, monotonic 1D route position at `now` for a vehicle's current MotionState."""
    elapsed = max(0.0, (now - state.seen_at).total_seconds())
    target = _target_along(state, now, cfg)

    if state.floor_along is not None:
        return max(state.floor_along, target)

    if state.start_along < state.fix_along and cfg.catchup_seconds > 0.0:
        u = elapsed / cfg.catchup_seconds
        if u < 1.0:
            return state.start_along + _smoothstep(u) * (target - state.start_along)

    return target


def ingest_fix(
    prev: MotionState | None,
    trip: tuple[Any, ...],
    fix_timestamp: datetime,
    fix_along: float,
    speed_kmh: float | None,
    stops: list[float],
    track_length: float,
    now: datetime,
    cfg: MotionConfig = DEFAULT_MOTION,
) -> MotionState:
    """Update or initialize MotionState when a new snapped GPS fix arrives."""
    same_trip = prev is not None and prev.trip == trip and fix_timestamp > prev.fix_timestamp
    prev_fix = (prev.fix_timestamp, prev.fix_along) if same_trip and prev is not None else None
    age_s = max(0.0, (now - fix_timestamp).total_seconds())
    v0 = fuse_speed(speed_kmh, prev_fix, fix_timestamp, fix_along, age_s, cfg)
    stop_cap = next_stop_cap(fix_along, stops, track_length, cfg.stop_clearance_m)

    start_along = fix_along
    floor_along: float | None = None
    hold_since: datetime | None = None

    if same_trip and prev is not None:
        displayed = estimate_along(prev, now, cfg)
        error = fix_along - displayed
        if 0.0 <= error <= cfg.max_path_m:
            # Real vehicle is ahead of displayed position: smoothly catch up from displayed.
            start_along = displayed
        elif -cfg.max_hold_overshoot_m <= error < 0.0:
            # Small overshoot: hold steady instead of rewinding, up to max_hold_seconds.
            since = prev.hold_since or now
            if (now - since).total_seconds() <= cfg.max_hold_seconds:
                start_along = displayed
                floor_along = displayed
                hold_since = since

    initial_prev = prev.last_along if same_trip and prev is not None else start_along
    return MotionState(
        trip=trip,
        fix_timestamp=fix_timestamp,
        fix_along=fix_along,
        seen_at=now,
        start_along=start_along,
        v0_ms=v0,
        stop_cap=stop_cap,
        floor_along=floor_along,
        hold_since=hold_since,
        last_eval_at=None,
        last_along=start_along,
        prev_along=initial_prev,
    )


def evaluate_tick(
    state: MotionState, now: datetime, cfg: MotionConfig = DEFAULT_MOTION
) -> TickEstimate:
    """Evaluate displayed position at `now` idempotently across clients.

    Returns TickEstimate(along, slice_start, extrapolated, holding).
    """
    if state.last_eval_at is None or now > state.last_eval_at:
        curr = estimate_along(state, now, cfg)
        prev = state.prev_along if state.last_eval_at is None else state.last_along
        holding = state.floor_along is not None and _target_along(state, now, cfg) < (
            state.floor_along
        )
        state.prev_along = prev
        state.last_along = curr
        state.last_holding = holding
        state.last_eval_at = now

    curr = state.last_along
    prev = state.prev_along
    slice_start = prev if 0.0 < curr - prev <= cfg.max_path_m else None
    extrapolated = curr > state.fix_along + 0.5
    return TickEstimate(curr, slice_start, extrapolated, state.last_holding)
