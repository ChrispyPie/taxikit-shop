# Ankomster: orsak vid inställda/borttagna

När föraren trycker på ett inställt eller borttaget tåg eller flyg visas en liten panel med orsaken.

## Tåg (Trafikverket via `/api/trains`)
- `Deviation` → `reason`
- `OtherInformation` + `Booking` → `info`
- Tomma och rena statusord som "Inställt" hoppas över.
- Stationslistan finns kvar; orsaken ligger överst.

## Flyg (Swedavia via `got.json`)
- `remarksSwedish` / `remarksEnglish` / `remark` / `remarks` → `reason` (och `rawStatus` som tidigare).
- Swedavia skickar ofta ingen text, då står "Ingen orsak angiven av Swedavia."

## Källor till kvällens Kungsbacka-inställelser (2026-11-06)
- Öresundståg: underhållsarbete Göteborg–Mölndal–Kungsbacka 6–8 november, bussar ersätter.
- Hallandstrafiken: samma banarbete, Västtåg Göteborg/Liseberg–Mölndal inställda.
