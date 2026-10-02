from app.geojson import to_feature_collection
from app.models import GpsPositionsResponse
from tests.test_models import SAMPLE


def test_vehicle_becomes_point_feature_with_lon_lat_order():
    data = GpsPositionsResponse.model_validate(SAMPLE)

    collection = to_feature_collection(data.vehicles, data.last_update)

    feature = collection.features[0]
    assert feature.geometry.coordinates == (18.6059, 54.3235)
    assert feature.properties.line == "213"
    assert feature.properties.vehicle_id == 145704


def test_empty_store_gives_empty_collection():
    collection = to_feature_collection([], None)

    assert collection.features == []
    assert collection.last_update is None


def test_tram_line_gets_tram_type():
    data = GpsPositionsResponse.model_validate(
        {**SAMPLE, "vehicles": [{**SAMPLE["vehicles"][0], "routeShortName": "8"}]}
    )

    collection = to_feature_collection(data.vehicles, data.last_update)

    assert collection.features[0].properties.type == "tram"
