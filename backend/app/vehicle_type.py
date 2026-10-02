from app.schemas import VehicleType

TRAM_LINES = {str(n) for n in range(2, 13)}


def detect_vehicle_type(line: str) -> VehicleType:
    return "tram" if line.strip() in TRAM_LINES else "bus"
