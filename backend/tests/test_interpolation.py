from datetime import UTC, datetime, timedelta

import pytest

from app.interpolation import (
    MotionConfig,
    damped_advance,
    estimate_along,
    evaluate_tick,
    fuse_speed,
    ingest_fix,
    next_stop_cap,
)

T0 = datetime(2026, 11, 22, 12, 0, 0, tzinfo=UTC)
TRIP = (8, 7, T0)
STOPS = [100.0, 400.0, 800.0]
TRACK_LEN = 1200.0


def at(seconds: float) -> datetime:
    return T0 + timedelta(seconds=seconds)


def test_next_stop_cap_skips_current_stop_within_clearance():
    assert next_stop_cap(50.0, STOPS, TRACK_LEN) == 100.0
    # Departing stop at 100 m should target 400 m, not stay pinned to 100 m.
    assert next_stop_cap(95.0, STOPS, TRACK_LEN) == 400.0
    assert next_stop_cap(100.0, STOPS, TRACK_LEN) == 400.0
    assert next_stop_cap(900.0, STOPS, TRACK_LEN) == TRACK_LEN
    assert next_stop_cap(50.0, [], TRACK_LEN) == TRACK_LEN


def test_damped_advance_decays_and_never_overshoots_stop():
    cfg = MotionConfig()
    d5 = damped_advance(10.0, 5.0, 500.0, cfg)
    d10 = damped_advance(10.0, 10.0, 500.0, cfg)
    d20 = damped_advance(10.0, 20.0, 500.0, cfg)

    assert 0.0 < d5 < d10 < d20 < 200.0
    # Marginal speed decreases over time (exponential decay).
    assert (d10 - d5) < d5
    # With a stop 60 m ahead, soft-braking approaches 60 m monotonically without overshooting.
    near_10 = damped_advance(15.0, 10.0, 60.0, cfg)
    near_25 = damped_advance(15.0, 25.0, 60.0, cfg)
    assert 0.0 < near_10 < near_25 < 60.0


def test_fuse_speed_respects_zero_gps_speed_and_staleness():
    cfg = MotionConfig()
    prev = (at(0), 100.0)
    # Stopped according to GPS -> zero speed even if previous segment was fast.
    assert fuse_speed(0.0, prev, at(20), 300.0, age_s=5.0, cfg=cfg) == 0.0
    # Stale fix -> zero speed.
    assert fuse_speed(36.0, prev, at(20), 300.0, age_s=60.0, cfg=cfg) == 0.0
    # Blended GPS (36 km/h = 10 m/s) and realized (100 m / 20 s = 5 m/s) -> 0.6*10 + 0.4*5 = 8 m/s.
    assert fuse_speed(36.0, prev, at(20), 200.0, age_s=5.0, cfg=cfg) == pytest.approx(8.0)
    # Missing GPS speed falls back to realized segment speed.
    assert fuse_speed(None, prev, at(20), 200.0, age_s=5.0, cfg=cfg) == pytest.approx(5.0)


def test_elastic_catchup_is_continuous_and_monotonic():
    cfg = MotionConfig()
    s0 = ingest_fix(None, TRIP, at(0), 100.0, 18.0, STOPS, TRACK_LEN, at(0), cfg)
    displayed_before = estimate_along(s0, at(20), cfg)
    assert displayed_before < 250.0

    # Real vehicle moved further than our damped estimate (undershoot).
    s1 = ingest_fix(s0, TRIP, at(20), 260.0, 36.0, STOPS, TRACK_LEN, at(20), cfg)
    positions = [estimate_along(s1, at(20 + t), cfg) for t in (0.0, 1.0, 2.0, 3.5, 6.0)]

    # Zero jump at arrival, strictly increasing, and catches up past 260 m smoothly.
    assert positions[0] == pytest.approx(displayed_before)
    assert positions == sorted(positions)
    assert positions[3] > 260.0


def test_small_overshoot_holds_without_rewinding_then_resumes():
    cfg = MotionConfig()
    s0 = ingest_fix(None, TRIP, at(0), 100.0, 54.0, STOPS, TRACK_LEN, at(0), cfg)
    displayed_before = estimate_along(s0, at(15), cfg)
    assert displayed_before > 200.0

    # New fix arrived 40 m behind displayed position (within 90 m hold threshold).
    actual = displayed_before - 40.0
    s1 = ingest_fix(s0, TRIP, at(15), actual, 36.0, STOPS, TRACK_LEN, at(15), cfg)
    assert s1.floor_along == pytest.approx(displayed_before)
    tick_hold = evaluate_tick(s1, at(15), cfg)
    assert tick_hold.along == pytest.approx(displayed_before)
    assert tick_hold.holding is True
    # While advancing target is still behind floor, marker holds still (never rewinds).
    tick_still_holding = evaluate_tick(s1, at(17), cfg)
    assert tick_still_holding.along == pytest.approx(displayed_before)
    assert tick_still_holding.holding is True
    # Once advancing target catches up past floor, marker smoothly resumes moving forward.
    tick_resumed = evaluate_tick(s1, at(25), cfg)
    assert tick_resumed.along > displayed_before
    assert tick_resumed.holding is False


def test_large_overshoot_or_expired_hold_resets_cleanly():
    cfg = MotionConfig()
    s0 = ingest_fix(None, TRIP, at(0), 100.0, 54.0, STOPS, TRACK_LEN, at(0), cfg)
    displayed_before = estimate_along(s0, at(15), cfg)

    # Discrepancy > max_hold_overshoot_m (90 m) resets immediately.
    far_behind = displayed_before - 110.0
    s_large = ingest_fix(s0, TRIP, at(15), far_behind, 0.0, STOPS, TRACK_LEN, at(15), cfg)
    assert s_large.floor_along is None
    assert estimate_along(s_large, at(15), cfg) == pytest.approx(far_behind)

    # Holding past max_hold_seconds (35 s) with a stopped vehicle also resets.
    s_hold = ingest_fix(
        s0, TRIP, at(15), displayed_before - 30.0, 0.0, STOPS, TRACK_LEN, at(15), cfg
    )
    assert s_hold.floor_along == pytest.approx(displayed_before)
    s_expired = ingest_fix(
        s_hold, TRIP, at(55), displayed_before - 30.0, 0.0, STOPS, TRACK_LEN, at(55), cfg
    )
    assert s_expired.floor_along is None
    assert estimate_along(s_expired, at(55), cfg) == pytest.approx(displayed_before - 30.0)


def test_evaluate_tick_is_idempotent_for_multiple_clients():
    cfg = MotionConfig()
    state = ingest_fix(None, TRIP, at(0), 100.0, 36.0, STOPS, TRACK_LEN, at(0), cfg)
    first = evaluate_tick(state, at(0), cfg)
    second_client = evaluate_tick(state, at(0), cfg)
    assert first == second_client
    assert first[1] is None  # No movement yet at t=0.

    tick1_a = evaluate_tick(state, at(1), cfg)
    tick1_b = evaluate_tick(state, at(1), cfg)
    assert tick1_a == tick1_b
    assert tick1_a[0] > 100.0
    assert tick1_a[1] == pytest.approx(100.0)
    assert tick1_a[2] is True
