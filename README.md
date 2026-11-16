# System śledzenia pojazdów komunikacji miejskiej (autobusy, tramwaje) w Gdańsku w czasie rzeczywistym. Projekt realizowany jako praca dyplomowa (inżynierska).

## O projekcie
Celem projektu jest dostarczenie mieszkańcom Gdańska i turystom aplikacji webowej wolnej od reklam, która precyzyjnie określa położenie pojazdów i szacuje rzeczywisty czas przyjazdu na przystanek (ETA). Dane pobierane są na żywo z oficjalnego API Otwartych Danych Gdańska (system TRISTAR), z wykorzystaniem endpointów w wersji drugiej (`v=2`), które dostarczają m.in. dokładną prędkość pojazdów.

## Główne cele
* Śledzenie autobusów i tramwajów na żywo na interaktywnej mapie.
* Po kliknięciu pojazdu: pełna trasa kursu ze strzałkami kierunku i wysuwany od dołu panel z prędkością, punktualnością i listą przystanków kursu. Panel pokazuje ostatni miniony przystanek, pozycję pojazdu i dwa kolejne przystanki z prognozą ZTM; strzałka w dół rozwija całą listę, a strzałka w górę ją zwija. Dotknięcie przystanku na liście podświetla go na mapie, a dotknięcie „Tramwaj/Autobus jest tutaj” pokazuje pojazd; mapa przesuwa się tylko wtedy, gdy cel jest poza widokiem lub pod panelem. Pozostałe pojazdy są ukryte do zamknięcia panelu; sam wybór pojazdu nie zmienia przybliżenia ani położenia mapy.
* Przystanki ZTM po przybliżeniu mapy (zoom 14,32+): ikony Material autobusu i tramwaju, nazwa i kod stanowiska oraz najbliższe odjazdy z odliczaniem. Czerwony oznacza tramwaj, niebieski autobus; wspólne przystanki mają obie ikony. Symbole przystanków z mapy bazowej są ukryte.
* Podczas oglądania trasy pojazdu tylko przystanki jego wariantu kursu zachowują kolory i pozostają widoczne po oddaleniu mapy. Pozostałe, także stanowiska w przeciwnym kierunku, są szare i znikają poniżej zwykłego progu przybliżenia. Dopasowanie korzysta z identyfikatorów ZTM; brak danych o przystankach nie powoduje zgadywania kierunku.
* Wyświetlanie aktualnej prędkości pojazdów oraz opóźnień względem oficjalnego rozkładu.
* Czysty, responsywny interfejs zoptymalizowany pod kątem szybkiego ładowania.

## Technologie i Architektura
* **Backend / Logika:** Python 3.12, FastAPI, httpx, Pydantic (zależności przez [uv](https://docs.astral.sh/uv/))
* **Frontend / UI:** React + TypeScript (Vite), MUI, MapLibre GL JS, React Query
* **Mapa:** kafelki z [OpenFreeMap](https://openfreemap.org) (bez reklam, bez klucza API)
* **Infra:** Docker, Docker Compose, Redis 7 (stan pojazdów, cache tras i danych ZTM, pub/sub)

Backend co sekundę pyta `https://ckan2.multimediagdansk.pl/gpsPositions?v=2` (ZTM odświeża dane mniej więcej co 20 s), odrzuca złe rekordy (poza Trójmiastem, stare, duplikaty) i zapisuje ostatni stan w Redisie. Gdy działa kilka instancji backendu, miasto odpytuje tylko jedna (blokada lidera w Redisie), a reszta dostaje nowe pozycje przez Redis pub/sub. Frontend nie odpytuje już `/api/vehicles` w kółko – trzyma jedno połączenie WebSocket (`/ws/vehicles`) i dostaje tylko pojazdy z widocznego fragmentu mapy (z zapasem ok. 30% na brzegach). Jak WebSocket nie działa (np. proxy go blokuje), frontend sam przechodzi na zwykłe odpytywanie REST i co chwilę próbuje się połączyć ponownie.

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
* Redis startuje razem z nimi jako osobny kontener (`redis`), backend łączy się z nim przez `REDIS_URL`.

### Lokalnie bez Dockera
Backend:
```bash
docker run -d --name transport-redis -p 6379:6379 redis:7-alpine
cd backend
uv sync
REDIS_URL=redis://localhost:6379/0 uv run uvicorn app.main:app --reload
```

Redis nie jest obowiązkowy: bez `REDIS_URL` (albo gdy Redis nie odpowiada przy starcie) backend działa na wersji w pamięci i loguje ostrzeżenie. Wtedy jednak cache nie jest współdzielony między instancjami.

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
| `POLL_INTERVAL_SECONDS` | backend | `1` | co ile sekund pytamy API miasta (min. 1) |
| `GDANSK_API_TIMEOUT_SECONDS` | backend | `5` | timeout zapytania do API miasta |
| `CORS_ORIGINS` | backend | `http://localhost:5173,http://127.0.0.1:5173` | dozwolone originy (po przecinku) |
| `REDIS_URL` | backend | brak (pamięć) | adres Redisa, np. `redis://localhost:6379/0` |
| `DATABASE_URL` | backend | brak (wyłączone) | adres PostgreSQL do zapisywania historii GPS (patrz niżej) |
| `LIVE_TICK_SECONDS` | backend | `1` | co ile sekund WebSocket wysyła pozycje przy dużym przybliżeniu |
| `OVERVIEW_INTERVAL_SECONDS` | backend | `5` | co ile sekund wysyłamy pozycje przy małym przybliżeniu |
| `DETAIL_MIN_ZOOM` | backend | `13` | od tego zoomu działa przyciąganie do trasy |
| `SNAP_MAX_DISTANCE_M` | backend | `75` | maks. odległość od trasy, przy której przyciągamy pojazd (dalej = surowy GPS) |
| `VITE_API_URL` | frontend | `http://localhost:8000` | adres naszego backendu (z niego liczymy też adres WebSocketu: `http`→`ws`, `https`→`wss`) |
| `VITE_POLL_INTERVAL_MS` | frontend | `1000` | co ile ms odpytujemy REST, gdy WebSocket nie działa (min. 1000, zła wartość = domyślna) |

Przykłady są w `backend/.env.example` i `frontend/.env.example`. W Dockerze backend czyta `backend/.env` (jeśli plik istnieje), więc wystarczy go skopiować z `.env.example` i zmienić wartości.

## API
* `GET /health` – zwraca `{"status": "ok"}`
* `WS /ws/vehicles` – pozycje pojazdów na żywo. Po połączeniu serwer od razu wysyła wszystkie pojazdy, a potem tylko te z widocznego obszaru. Klient wysyła JSON-y:
  * `{"type": "viewport", "bbox": [zachód, południe, wschód, północ], "zoom": 14.2}` – po każdym przesunięciu/zoomie mapy,
  * `{"type": "select", "vehicle_id": 123}` – wybrany pojazd (przychodzi zawsze, nawet poza ekranem; `null` = brak),
  * `{"type": "watch", "vehicle_ids": [1, 2]}` – pojazdy z otwartego panelu przystanku (max 50).

  Serwer odsyła `{"type": "vehicles", "total": 214, "detailed": true, "last_update": "...", "features": [...]}`, gdzie `total` to liczba wszystkich pojazdów w mieście, a `features` to te same obiekty co w `GET /api/vehicles` (plus `snapped: true`, jeśli pozycja jest przyciągnięta do trasy). Przy zoomie ≥ 13 ramki idą co sekundę (z przyciąganiem do trasy), przy mniejszym co 5 s. Połączenia z obcego `Origin` (spoza `CORS_ORIGINS`) są odrzucane.
* `GET /api/vehicles` – pozycje pojazdów jako GeoJSON `FeatureCollection` (współrzędne w kolejności `[lon, lat]`, właściwości: `vehicle_id`, `vehicle_code`, `route_id`, `trip_id`, `scheduled_trip_start_time`, `line`, `type` (`bus`/`tram`), `headsign`, `speed`, `direction`, `delay`, `timestamp`)
* `GET /api/vehicles/{vehicle_id}/journey` – pełna trasa jako GeoJSON `Feature`, przystanki kursu w kolejności (`stops`: nazwa, kod, prognoza ZTM `estimated_time` i `passed`) oraz najbliższa dostępna prognoza ZTM dla tego pojazdu i kursu; `404`, gdy pojazdu nie ma już w buforze GPS. Odpowiedź rozróżnia brak danych, nieaktualną prognozę i błąd źródła. Frontend odpytuje ten endpoint co 10 s wyłącznie dla otwartego panelu.
* `GET /api/stops` – pasażerskie przystanki autobusowe, tramwajowe i wspólne z oficjalnego katalogu ZTM jako GeoJSON; pomija przystanki wirtualne, zajezdnie i rekordy bez określonego typu lub poprawnych współrzędnych.
* `GET /api/stops/{stop_id}/arrivals` – do 8 najbliższych odjazdów, posortowanych według czasu, z linią, kierunkiem i oznaczeniem prognozy lub rozkładu. Wykorzystuje wspólny cache prognoz 20 s; frontend odświeża co 10 s tylko wybrany przystanek. Nieaktualne dane nie wyświetlają odliczania. Brak tablicy w źródle jest odróżniony od pustej listy odjazdów; błędy źródła zwracają `503`.

Trasy pobieramy z `https://ckan2.multimediagdansk.pl/shapes?date={YYYY-MM-DD}&routeId={routeId}&tripId={tripId}`. Nazwy i kolejność przystanków pochodzą z zasobów `stops.json` i `stopsintrip.json` w [oficjalnym zbiorze ZTM](https://ckan.multimediagdansk.pl/pl/dataset/tristar). Backend przechowuje geometrię w pamięci do 6 godzin, a dane przystanków do godziny, osobno dla każdej daty w strefie `Europe/Warsaw`. Pierwsze otwarcie panelu wymaga pobrania dużych plików statycznych.

### Przyciąganie do trasy i ruch pojazdów
Przy zoomie ≥ 13 backend dla widocznych pojazdów dociąga geometrię kursu (tylko tych, które ktoś ogląda – nie wszystkie ~300 naraz; max 5 zapytań do ZTM jednocześnie, wynik leży w Redisie 6 h). Pozycję GPS rzutujemy na najbliższy punkt trasy z uwzględnieniem kierunku jazdy (ta sama funkcja co przy liczeniu minionych przystanków). Jeśli pojazd jest dalej niż 75 m od trasy (zjazd do zajezdni, objazd, kurs jeszcze się nie zaczął), pokazujemy surowy GPS.

Pojazd stoi w ostatnim znanym miejscu na trasie, a po nowym odczycie GPS (ZTM daje go mniej więcej co 20 s) w 1,5 s przejeżdża **po trasie** do nowej pozycji – backend dokleja wtedy do pojazdu kawałek geometrii (`path`), po którym frontend animuje marker. Tak samo robi np. Jakdojade: prawie zero dodatkowego opóźnienia, ale pojazd między odczytami stoi.

Próbowaliśmy też ekstrapolacji (przesuwanie pojazdu między odczytami z prędkością z GPS) i zmierzyliśmy ją na żywych danych (ok. 2400 par kolejnych odczytów): mediana błędu pozycji po ~20 s spadała z 71 m (stanie w miejscu) do 20 m, ale przy odczytach co ~20 s i opóźnieniu danych ZTM 20–30 s pojazdy co chwilę przyspieszały, zatrzymywały się na przystankach i cofały przy nowym odczycie, a prognozy ZTM `departures` dawały jeszcze gorszy wynik (54 m). Na mapie wyglądało to gorzej niż spokojne przejście, więc zostaliśmy przy przejściu po trasie.

### Zapis historii GPS (dane do modelu)
Backend umie zapisywać każdy nowy odczyt GPS (pojazd, linia, kurs, współrzędne, prędkość, kierunek, opóźnienie, czas odczytu i czas odebrania) do tabeli `gps_fixes` w PostgreSQL. **Domyślnie jest to wyłączone** – bez `DATABASE_URL` aplikacja działa jak zwykle. Zapisuje tylko instancja, która odpytuje ZTM, i tylko nowe odczyty (klucz: pojazd + czas odczytu), więc nic się nie dubluje. Jak baza nie odpowiada, backend loguje ostrzeżenie, próbuje ponownie co 30 s, a mapa działa dalej. To ok. 1–1,5 mln wierszy, czyli kilka GB na miesiąc.

Włączenie (na serwerze, który chodzi 24/7):

1. W katalogu projektu utwórz plik `.env` (obok `docker-compose.yml`) z hasłem do bazy:
   ```
   POSTGRES_PASSWORD=jakies-dlugie-haslo
   ```
2. W `backend/.env` ustaw adres bazy z tym samym hasłem:
   ```
   DATABASE_URL=postgresql://transport:jakies-dlugie-haslo@postgres:5432/transport
   ```
3. Uruchom z profilem `recording` (dochodzi kontener `postgres` z wolumenem `postgres_data`):
   ```bash
   docker compose --profile recording up -d --build
   ```
4. Sprawdź, że dane lecą (w logach backendu powinno być `recording gps fixes to database`):
   ```bash
   docker compose logs backend | grep recording
   docker compose exec postgres psql -U transport -d transport -c "select count(*), max(generated) from gps_fixes;"
   ```

Baza nie wystawia portu na zewnątrz. Kopia danych dla zespołu:
```bash
docker compose exec -T postgres pg_dump -U transport -Fc transport > gps_$(date +%F).dump
pg_restore -d <lokalna_baza> gps_RRRR-MM-DD.dump
```

Jeśli aplikacja na serwerze nie jest uruchamiana przez nasz `docker-compose.yml`, wystarczy dowolny PostgreSQL 14+ i zmienna `DATABASE_URL` w środowisku backendu – tabelę backend tworzy sam przy pierwszym połączeniu.

### Wdrożenie za proxy
Jeśli przed aplikacją stoi nginx (albo inne proxy), trzeba przepuścić WebSocket, inaczej frontend będzie działał tylko na zapasowym odpytywaniu REST:

```nginx
location /ws/ {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 1h;
}
```

Przy HTTPS frontend sam użyje `wss://`. Adres strony musi być w `CORS_ORIGINS`, bo ta sama lista sprawdza `Origin` WebSocketu.

Prognozy pochodzą z `https://ckan2.multimediagdansk.pl/departures` (wspólny cache 20 s). Dopasowanie wymaga zgodności `vehicleId`, `routeId`, `tripId` i `scheduledTripStartTime`; odrzucamy prognozy przeterminowane oraz dane GPS/prognozy starsze niż 90 s. Odliczanie dotyczy pierwszego nieminionego przystanku z dostępną, przyszłą prognozą ZTM; pozostałe przystanki z prognozą mają godzinę. To, które przystanki pojazd już minął (`passed`), backend wylicza geometrycznie: rzutuje przystanki (po kolei) i pozycję GPS na kształt trasy, a przy trasach przechodzących dwa razy tą samą ulicą wybiera odcinek zgodny z kierunkiem jazdy. Przy pozycji GPS starszej niż 90 s, dalej niż 100 m od trasy albo bez geometrii `passed` ma wartość `null`, a panel nie pokazuje pozycji pojazdu na liście. Czas dotyczy prognozowanego odjazdu; nie wyliczamy go z prędkości GPS. Przy braku wiarygodnej prognozy panel pokazuje brak danych. Brak przystanków lub prognozy nie blokuje wyświetlania dostępnej geometrii.

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
npm run test:e2e
```

Testy e2e (Playwright) same budują aplikację i stawiają `vite preview`, backend jest mockowany w testach. Za pierwszym razem trzeba doinstalować przeglądarkę: `npx playwright install --with-deps chromium`.

Endpointy można też sprawdzić w Postmanie – kolekcja jest w `backend/postman/`.

Wszystko naraz (lint + testy + build obu części): `./scripts/check.sh` (na Windowsie przez WSL albo Git Bash), a razem z e2e: `./scripts/check.sh --e2e`.
