import pytest
from pydantic import ValidationError

from app.config import Settings


def test_default_interval():
    assert Settings(_env_file=None).poll_interval_seconds == 12.0


def test_interval_from_env(monkeypatch):
    monkeypatch.setenv("POLL_INTERVAL_SECONDS", "15")

    assert Settings(_env_file=None).poll_interval_seconds == 15.0


@pytest.mark.parametrize("value", ["0", "-5", "0.5"])
def test_rejects_too_small_interval(monkeypatch, value):
    monkeypatch.setenv("POLL_INTERVAL_SECONDS", value)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
