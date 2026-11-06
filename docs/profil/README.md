# Profil + Inkorg under profilikonen (mock 2026-11-06)

**Status:** bara mock. Ingen kod, ingen SQL i prod.

## Toppraden
- **🔔 Klockan** — bara notiser (flyg/tåg, prognos, nyheter). Kan bli många → separat.
- **👤 Profil** — öppnar profilsidan. Badge = olästa i **Inkorg** (forum-svar, ärendesvar, sjuk/timmar).

Mockar: `/workspace/taxidata-cleanup/mocks/profil/`
Skärmdumpar: `/workspace/taxidata-cleanup/screenshots/profil/`
- `01-topbar.png` — klocka + profil med badge
- `02-profil.png` — statistik, galleri, gästbok
- `03-inkorg.png` — inkorg under profil


## Notisregel (klar med Christian)
När ägare eller admin svarar i ett **öppet ärende**:
1. Meddelandet läggs in i förarens **inkorgstråd** (under profilikonen).
2. **Klockan** får samtidigt en kort notis som länkar till samma tråd.
3. När föraren **läser** svaret rensas markeringen på **båda** ställena (inkorg-badge och klock-notis).

Klockan behålls separat eftersom notiser (flyg/tåg, prognos, nyheter) kan bli många. Inkorg = konversation/ärenden.

## Profilsida (förslag)
- År som taxichaufför (föraren sätter startår eller startdatum)
- Antal forum-trådar och forum-svar
- Ev. säkra TaxiData-siffror: pass i år, timmar i år, medlem sedan
- Eget galleri (foto-uppladdning)
- Gästbok / anslagstavla: andra skriver, ägaren kan ta bort
- **Poäng (senare):** idé — poäng för bra forum-svar, hjälpsamhet, säkra körpass. Basen är inte bestämd. Bara plats i designen, ingen bygg.

## Databas (additivt, skiss — bygg inte än)

| Tabell | Innehåll |
|--------|----------|
| `driver_profile` | `driver_id` PK, `taxi_start_year` int eller `taxi_start_date` date, `bio` text (kort), `updated_at` |
| `profile_gallery` | `id`, `driver_id`, `storage_path`, `caption`, `sort_order`, `created_at` |
| `profile_guestbook` | `id`, `profile_driver_id`, `author_id`, `body`, `created_at`, `hidden` |

### Storage + RLS (skiss)
- Bucket `profile-gallery` (privat). Uppladdning via edge-funktion med session-token (samma mönster som forum/önskemål-foto).
- RLS: läs galleri för inloggade förare; skriv/radera bara egen rad.
- Gästbok: alla inloggade får INSERT på andras profil; DELETE bara `profile_driver_id = me` (eller S admin).
- Forum-räknare: `count(*)` från `forum_threads` / `forum_replies` per `author_id` (inga nya kolumner behövs).

## Inte i den här mocken
- Poängsystem (bara gul stub-ruta i UI)
- Bygg / SQL / edge-funktioner
