from app.models import GpsPositionsResponse

SAMPLE = {
    "lastUpdate": "2026-09-23T12:00:05Z",
    "vehicles": [
        {
            "generated": "2026-09-23T12:00:01Z",
            "routeShortName": "213",
            "tripId": 51,
            "routeId": 213,
            "headsign": "Kowale Szkoła",
            "vehicleCode": "2768",
            "vehicleService": "213-01",
            "vehicleId": 145704,
            "speed": 0,
            "direction": 315,
            "delay": 21,
            "scheduledTripStartTime": "2026-09-23T11:55:00Z",
            "lat": 54.3235,
            "lon": 18.6059,
            "gpsQuality": 3,
        }
    ],
}


def test_parses_gdansk_payload():
    data = GpsPositionsResponse.model_validate(SAMPLE)

    assert len(data.vehicles) == 1
    vehicle = data.vehicles[0]
    assert vehicle.vehicle_id == 145704
    assert vehicle.line == "213"
    assert vehicle.lat == 54.3235
    assert vehicle.timestamp.year == 2026


def test_ignores_unknown_fields():
    payload = {**SAMPLE, "vehicles": [{**SAMPLE["vehicles"][0], "foo": "bar"}]}

    data = GpsPositionsResponse.model_validate(payload)

    assert not hasattr(data.vehicles[0], "foo")
