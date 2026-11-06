# Inkorg + Ärenden + samma statusord (2026-11-06)

Christians "kör" 6 nov 18:50 (t962u) på tre punkter + Inkorg och gemensam ärendelista.
**Inte live.** Merga inte och kör inte SQL i prod förrän Christian sagt kör.

## Vad
1. **Klara fälls ihop.** Bara öppna ärenden syns. Klara ligger under "Visa klara (N)".
   Gäller Inkorgen, Admin › Ärenden (nytt), Bil-listorna och Admin › Anmälningar (som redan hade det; där stod det "åtgärdade", nu "klara"). Forumet hade redan "Visa klara".
2. **Samma statusord överallt:** Ny · Pågår · Väntar på svar · Klar, plus filterchips per status.
   Värdena i databasen ändras inte, bara orden (`arende-status.js` och `private.case_st`).
3. **"Behöver ditt svar"** markeras med en orange etikett och en egen rubrik överst.
4. **Inkorg (förare)** under 👤 uppe till höger: mina ärenden som trådar, olästa svar, "Behöver ditt svar".
   Klockan 🔔 är kvar för notiser. När ägaren svarar på ett ärende får klockan en kort notis ("Nytt i Inkorgen") som öppnar tråden. Läser man svaret försvinner både pricken i Inkorgen och notisen.
5. **Admin › Ärenden** (ny första ruta): gemensam lista för ägaren och S admin, inte en personlig inkorg.
   Nya och olösta först, rubriker, tryck för att öppna ärendet separat med verktyg (svara, ändra status).
   Gamla Admin › Anmälningar & ärenden finns kvar som förut.

## Statusord, gammalt → nytt
| Ärende | Gammalt (databas → gammalt ord) | Nytt ord |
|---|---|---|
| Felanmälan / Behövs till bilen | ny → Ny | Ny |
| | pagar → Pågår | Pågår |
| | klar → Klar (förare) / **Åtgärdad** (admin) | Klar |
| Verkstadstid | pending → Väntar | Ny |
| | pending + ägaren frågat → "Fråga till dig" / "Fråga · väntar på svar" | Väntar på svar |
| | pending + föraren svarat → "Svar skickat" / "Nytt svar" | Pågår |
| | approved → Godkänd | Klar · godkänd |
| | rejected → Nekad | Klar · nekad |
| Uppgift | ny → Ny | Väntar på svar (föraren ska boka/svara) |
| | bokad → Bokad | Pågår · tid bokad |
| | klar → Klar | Klar |
| Sjukanmälan | ny → Väntar på ägaren | Ny |
| | intyg_begart → Läkarintyg begärt | Väntar på svar · läkarintyg |
| | godkand → Godkänd | Klar · godkänd |
| | avslagen → Avslagen | Klar · avslagen |
| Önskemål | ny → Ny | Ny |
| | last → Läst | Pågår · läst |
| | planerad → Planerad | Pågår · planerad |
| | klar → Klar | Klar |
| | inte_nu → Inte nu | Klar · inte nu |
| Forum (Önskemål/Buggar) | ny / pagar / planerad / klar | Ny / Pågår / Pågår · planerad / Klar |
| Underhåll (förslag/plan/klar) | oförändrat – det är planering, inte ärenden | – |

## Filer
- `TaxiData/arende-status.js` – statusord, filterchips, tråd-vy (delas)
- `TaxiData/inkorg.js` – förarens Inkorg
- `TaxiData/arenden-admin.js` – Admin › Ärenden
- `TaxiData/index.html` – menyrad "📥 Inkorg", prick på 👤, bakåtknapp
- `TaxiData/admin.html` – ny ruta "📥 Ärenden", länk `admin.html#arende=issue:12`
- `TaxiData/notis.js` – ärendenotiser öppnar tråden
- `TaxiData/verkstad.js`, `verkstad-admin.js`, `sjuk.js`, `onskemal-admin.js`, `forum.js` – bara statusorden

## SQL (bara tillägg)
- `supabase/migrations/20261106e_inkorg_arenden.sql`
- Ångra: `supabase/migrations/undo/20261106e_inkorg_arenden_undo.sql` (se UNDO.md)

Nytt: kolumnerna `event_notices.case_kind/case_id`, tabellen `case_reads`, triggern `aa_case_tag`,
funktionerna `case_inbox`, `case_get`, `case_seen`, `case_admin_list`, `private.case_st`.
`notis_feed` byts ut med samma signatur + två fält. Inga befintliga rader ändras.
Svar och statusändringar går genom de gamla funktionerna (car_issue_message, set_car_issue_status,
workshop_reply, workshop_ask, admin_workshop_decide, sjuk_decide).

Testat lokalt i PGlite (Postgres 18) med stubbar: inkorg, tråd, läst-markering (tar bort klockans notis),
behörighet (annat åkeri och förare nekas adminlistan), ångra, och att migrationen kan köras två gånger.

## Gå live (när Christian sagt kör)
1. Kör `20261106e_inkorg_arenden.sql` i Supabase.
2. Merga PR:en (GitHub Pages).
3. Nyheter-rad i `changelog.js`.

## Bilder (harness 390 px, påhittade exempel)
`docs/inkorg/real/` och `/workspace/taxidata-cleanup/screenshots/inkorg/`
