from datetime import UTC, datetime

from app.schemas import PointGeometry, VehicleFeature, VehicleFeatureCollection, VehicleProperties


def test_feature_collection_serializes_to_geojson():
    feature = VehicleFeature(
        id=1,
        geometry=PointGeometry(coordinates=(18.6466, 54.352)),
        properties=VehicleProperties(
            vehicle_id=1, line="8", type="tram", timestamp=datetime(2026, 9, 25, tzinfo=UTC)
        ),
    )

    data = VehicleFeatureCollection(features=[feature]).model_dump(mode="json")

    assert data["type"] == "FeatureCollection"
    assert data["features"][0]["type"] == "Feature"
    assert data["features"][0]["geometry"] == {"type": "Point", "coordinates": [18.6466, 54.352]}
