# System śledzenia pojazdów komunikacji miejskiej (autobusy, tramwaje) w Gdańsku w czasie rzeczywistym. Projekt realizowany jako praca dyplomowa (inżynierska).

## O projekcie
Celem projektu jest dostarczenie mieszkańcom Gdańska i turystom aplikacji webowej wolnej od reklam, która precyzyjnie określa położenie pojazdów i szacuje rzeczywisty czas przyjazdu na przystanek (ETA). Dane pobierane są na żywo z oficjalnego API Otwartych Danych Gdańska (system TRISTAR), z wykorzystaniem endpointów w wersji drugiej (`v=2`), które dostarczają m.in. dokładną prędkość pojazdów.

## Główne cele
* Śledzenie autobusów i tramwajów na żywo na interaktywnej mapie.
* Wyświetlanie aktualnej prędkości pojazdów oraz opóźnień względem oficjalnego rozkładu.
* Czysty, responsywny interfejs zoptymalizowany pod kątem szybkiego ładowania.

## Technologie i Architektura
* **Backend / Logika:** Python 3.12, FastAPI, httpx, Pydantic (zależności przez [uv](https://docs.astral.sh/uv/))
* **Frontend / UI:** React + TypeScript (Vite), MUI, MapLibre GL JS, React Query
* **Mapa:** kafelki z [OpenFreeMap](https://openfreemap.org) (bez reklam, bez klucza API)
* **Infra:** Docker, Docker Compose

Backend co ~12 s pobiera pozycje GPS z `https://ckan2.multimediagdansk.pl/gpsPositions?v=2`, odrzuca złe rekordy (poza Trójmiastem, stare, duplikaty) i trzyma ostatni stan w pamięci. Frontend co 10 s pyta nasz backend (`/api/vehicles`) i rysuje pojazdy na mapie.

```
backend/    API w FastAPI (app/), testy (tests/), kolekcja Postman (postman/)
frontend/   aplikacja React (src/components, src/hooks, src/services, src/map)
```

## Uruchomienie

### Docker (najprościej)
```bash
docker compose up --build
```
* frontend: http://localhost:5173
* backend: http://localhost:8000 (Swagger: http://localhost:8000/docs)

### Lokalnie bez Dockera
Backend:
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

Frontend (Node 22.22+ albo 24, starszy Node nie odpali testów):
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Zmienne środowiskowe

| Zmienna | Gdzie | Domyślnie | Opis |
|---|---|---|---|
| `POLL_INTERVAL_SECONDS` | backend | `12` | co ile sekund pytamy API miasta (min. 1) |
| `GDANSK_API_TIMEOUT_SECONDS` | backend | `5` | timeout zapytania do API miasta |
| `CORS_ORIGINS` | backend | `http://localhost:5173,http://127.0.0.1:5173` | dozwolone originy (po przecinku) |
| `VITE_API_URL` | frontend | `http://localhost:8000` | adres naszego backendu |
| `VITE_POLL_INTERVAL_MS` | frontend | `10000` | co ile ms odświeżamy pojazdy (min. 1000, zła wartość = domyślna) |

Przykłady są w `backend/.env.example` i `frontend/.env.example`. W Dockerze backend czyta `backend/.env` (jeśli plik istnieje), więc wystarczy go skopiować z `.env.example` i zmienić wartości.

## API
* `GET /health` – zwraca `{"status": "ok"}`
* `GET /api/vehicles` – pozycje pojazdów jako GeoJSON `FeatureCollection` (współrzędne w kolejności `[lon, lat]`, właściwości: `vehicle_id`, `line`, `type` (`bus`/`tram`), `headsign`, `speed`, `delay`, `timestamp`)

## Testy i lint
Backend:
```bash
cd backend
uv run ruff check . && uv run ruff format --check .
uv run pytest
```

Frontend:
```bash
cd frontend
npm run lint
npm run format:check
npm test
```

Endpointy można też sprawdzić w Postmanie – kolekcja jest w `backend/postman/`.

Wszystko naraz (lint + testy + build obu części): `./scripts/check.sh` (na Windowsie przez WSL albo Git Bash).
