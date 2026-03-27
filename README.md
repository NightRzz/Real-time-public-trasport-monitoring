# System śledzenia pojazdów komunikacji miejskiej (autobusy, tramwaje) w Gdańsku w czasie rzeczywistym. Projekt realizowany jako praca dyplomowa (inżynierska).

## O projekcie
Celem projektu jest dostarczenie mieszkańcom Gdańska i turystom aplikacji webowej wolnej od reklam, która precyzyjnie określa położenie pojazdów i szacuje rzeczywisty czas przyjazdu na przystanek (ETA). Dane pobierane są na żywo z oficjalnego API Otwartych Danych Gdańska (system TRISTAR), z wykorzystaniem endpointów w wersji drugiej (`v=2`), które dostarczają m.in. dokładną prędkość pojazdów.

## Główne cele
* Śledzenie autobusów i tramwajów na żywo na interaktywnej mapie.
* Wyświetlanie aktualnej prędkości pojazdów oraz opóźnień względem oficjalnego rozkładu.
* Czysty, responsywny interfejs zoptymalizowany pod kątem szybkiego ładowania.

## Technologie i Architektura
* **Backend / Logika:** Python
* **Frontend / UI:** MapLibre GL JS  +  React
