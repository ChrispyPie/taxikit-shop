# Admin › Ekonomi, fas 1 (2026-11-27)

Förut Admin › Löner. Menyn heter nu **Ekonomi**, sidan **Åkeriekonomi**. Id `loner` och länken `admin.html#loner` är kvar (nya `#ekonomi` fungerar också).
Christians go för fas 1 27 nov 13:57. Berra är ägare (693340).

## Vad
- Total för perioden överst (verkstadstimmar + sjuklön), växla **Månad / År**, ‹ › för att byta period.
- Diagram: staplar per månad (tryck på en stapel för att hoppa dit) och en stapel per förare under Totalt per chaufför.
- Fällbara sektioner: Verkstadstimmar, Sjuklön, Totalt per chaufför. Varje förare går att öppna för specifikation (perioder, dagar, karens, månader).
- Ladda ner (CSV) och Kopiera för vald period. Timpris för verkstadstid ändras kvar här.
- Sjuklön räknas bara när ägaren markerat **Beviljad/Utbetald**. Perioder över månadsskifte delas dag för dag, karens dras först (första månaden).
- Beloppet sparas (`sick_reports.sjuklon_belopp`, `sjuklon_calc`) av en trigger när sjuklön sätts till Beviljad och perioden är avslutad. Öppna perioder räknas löpande.
- **Provision** är nu en inställning (`lonekost_settings.provision`, förvalt 37) under Bilar › Ändra lönekostnad och sjuklön. Den används av bilkalkylen och av `private.forar_lon_period` (och därmed `sjuk_lon_calc`). Lönebeskeden 2025-12 – 2026-09 visar "Rak %, std.taxi 37 x lönegrund", exakt 37,000 % där raden räknas.

## SQL
`supabase/migrations/20261127e_ekonomi_fas1.sql` (applicerad 2026-11-27, före merge). Ångra: `supabase/migrations/undo/20261127e_ekonomi_fas1_undo.sql`.
Nya: `ekonomi_period` (public, invoker) → `messaging_private.ekonomi_period` (bara ägare + superadmin, ej demo, bara eget åkeri) → `private.ekonomi_calc`; `private.sjuk_calc`, trigger `aa_sick_belopp`.
Ändrade (utökade): `private.lonekost_cfg`, `public.save_lonekost`, `private.forar_lon_period` (provision från inställning).

## Filer
`TaxiData/ekonomi.js` (ny sida), `admin.html` (meny, rubrik, provisionsfält, laddning), `demo.js` (påhittad data), `hem-sidor.js` (etikett), `changelog.js`, `sw.js`, `lazy-views.js`, `index.html` (cache-bust).
Gamla Löner-sidan i `verkstad-admin.js` (A.render, payroll_month) är kvar men används inte längre; `payroll_month` finns kvar på servern.

## Test
`node tests/ekonomi/unit.cjs`, `NODE_PATH=<playwright> node tests/ekonomi/browser.cjs docs/ekonomi/bilder` (påhittad data, 390 px ljust + mörkt).
Servern: provkörd i en transaktion som rullades tillbaka (testperiod 28 okt – 4 nov: 4 + 4 dagar, karens 637,45 kr i oktober, belopp sparat 3 005,10 kr).
