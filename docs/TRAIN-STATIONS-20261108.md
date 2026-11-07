# Ankomster: stationsval (utkast 2026-11-08)

Ingen produktionsändring eller databasändring ingår. Nyheter har förberedd rad med tom `tid`.

## För Christian

- Sex snabbval överst: Göteborg C **G**, Mölndal **Mdn**, Gamlestaden **Gas**, Kungsbacka **Kb**, Partille **P**, Alingsås **A**.
- Tryck på stationsnamnet med pil för den sökbara stationslistan. Även signaturer och sökning utan svenska accenter fungerar.
- Listan kommer från Trafikverket `TrainStation`, inte en manuellt begränsad lista. `Advertised=true`, `Deleted=false`, `CountryCode=SE`.
- Hela Västra Götaland (`CountyNo=14`) och norra Halland (`CountyNo=13`, WGS84-latitud **>=57.0**, dvs Kungsbacka/Varbergområdet). Hallandsstation utan koordinater tas inte med. Söder om Varbergområdet, exempelvis Halmstad, ingår inte. Ingen stationsgissning utifrån namnet.
- Ytterby är järnvägsstationen för Kungälv. Säve tas bara med om Trafikverket faktiskt annonserar stationen för resande; ingen påhittad persontrafik.
- Stationsvalet sparas i befintlig per-user `VIEW_STATE` och återställs efter omladdning. Flyg/Landvetter är oförändrat.
- **Tågbevakningar och tågnotiser gäller fortfarande Göteborg C.** Nuvarande backend för personliga bevakningar saknar station. Vi skapar inte felaktiga bevakningar från andra stationer: tydlig text och spärr i bevakningsåtgärden, ingen felaktig matchning/höjdpunkt. Utökade stationsspecifika notiser kräver separat arbete; ingen DB-migrering här.

## Signaturer och källor

Snabbvalen samt reservnamnen G/Mdn/Gas/Kb/Khe/Krd/Ldo/P/Lr/Fd/A/Yb/Än kontrollerade mot Transportstyrelsens officiella trafikplatsnamnsregister:
https://www.transportstyrelsen.se/globalassets/global/jarnvag/till-dig-i-branschen/tekniskt-godkannande/godkanda-trafikplatsnamn-transportstyrelsen-251114.pdf

**Mdn är Mölndal; M är Malmö.** Fd är Floda, Yb är Ytterby. Reservfilen `TaxiData/train-stations.js` är inte serverns whitelist. Den exakta kompletta listan beror på Trafikverkets aktuella annonserade stationer och ska verifieras i Vercels miljö före go-live.

Trafikverkets officiella schema 1.5 använder `namespace="rail.infrastructure"`:
https://data.trafikverket.se/news/datacache/trainstation---new-schemaversion
https://data.trafikverket.se/documentation/datacache/data-model

## Backend och cache

`GET /api/trains?stations=1`: katalog, uppdateringstid och stale-markering. Endast id/namn skickas till klienten. Trafikverkets API-nyckel stannar på servern.

`GET /api/trains?station=Kb` och `?station=Kb&route=123&sched=<ISO>`: stationen valideras mot samma katalog, inte mot klientens val. Okänd station ger 400; dubbletter och XML-injektion avvisas. Utelämnad station fortsätter vara G.

- Katalog: 24 h instans/CDN-cache, en delad pågående hämtning; 60 s negativ cache vid upstreamfel. Senaste godkända katalog kan användas högst sju dygn vid fel. Inga nya icke-G-stationer godkänns om giltig katalog saknas. G fungerar fortsatt vid katalogfel.
- Stationslistan i webbläsaren: offentlig metadata i localStorage i 24 h; hämtas först när Ankomster öppnas, aldrig i startskalet. Ingen sökfråga orsakar Trafikverket-anrop.
- Avgångstavlor: separat cache per station, 60 s frisk cache + CDN, 15 s felcache, samma-stations reservsvar högst 15 min. Samtidiga anrop slås ihop.
- Tågrutt: cache/pågående anrop per **station + tågnr + tid**; rutten slutar vid vald station. Närstationsheuristik för Olskroken/Gubbero/Marieholm gäller bara G.
- Stationsbyte tömmer gammal lista/rutt och ignorerar sena svar från tidigare station. G:s statiska reservfil får aldrig användas för Kb eller annan station. Gammal Vercel-API som ignorerar `station` ger tydlig uppdateringsvarning, inte felmärkt Göteborgslista.

## Vercel behövs vid go-live — inte gjort nu

1. Behåll PR som draft tills Christian har granskat. **Manuell Vercel-deploy krävs**, eftersom nuvarande `/api/trains` inte har stationsstöd. Ingen Supabase-migrering.
2. Deploya backend **före** GitHub Pages-frontend. Befintlig `TRAFIKVERKET_API_KEY`/`TRAFIKVERKET_KEY` används; ingen ny nyckel i repo.
3. Med riktig Vercel-miljö: kontrollera `?stations=1` innehåller alla sex snabbvalen, Ytterby/Lerum och annonserade regionala stationer, men inte Malmö/Halmstad eller icke-annonserad infrastruktur. Kontrollera att Kb/Mdn/Gas svarar med rätt `stationSignature` och riktiga ankomster; okänd signatur ger 400. Kör två lika anrop och kontrollera cache.
4. Fyll Nyheter `tid` först vid godkänd publicering, merge utan force push, invänta Pages och kontrollera `?v=20261108stations1` samt byte-för-byte-filer.
5. Telefon: växla G → Kb → Mdn; öppna sökning, sök Ytterby/Lerum; ladda om på vald station. Kontrollera Inställt i rött, +N min, grå ankomna tåg, ruttdetaljer och att Landvetter fungerar. Testa långsamt nät och snabbt stationsbyte.

## Lokal verifiering

`node tests/train-stations/api.cjs`: syntetiska Trafikverket-svar; region/Advertised/Deleted/koordinater, injektion/dubbletter, whitelist, åtta samtidiga anrop, separata caches och stale-data, katalogfel/fail-closed, stationsspecifik rutt.

`node tests/train-stations/ui.cjs`: offline JSDOM, sex snabbval, sökning/accentsökning, dynamiska Ytterby, stationsbyte/omladdning, sena svar, +10 min/Inställt, flygisolering och gammal-API-spärr.

Befintliga lazy-view-, auth/admin- och mailbox-oläst-tester körs också. Det är DOM-/mocktester, **inte** verifiering mot riktig Trafikverket-nyckel eller en Android-browser. Inga riktiga mobilskärmbilder tagna: tillgängligt verktygsläge saknar browser/desktop-verktyg. Layout använder flex-wrap, 44 px tryckytor och sökruta i native dialog med scroll/maxhöjd 85dvh.

## Ångra

Backup: `backup/pre-train-stations-20261108` (pushed före arbetet).

Före merge: stäng draft-PR; produktion är oförändrad.

Efter eventuell merge: `git pull --rebase origin main; git revert <mergecommit>; git push origin main` och invänta Pages. Ingen force push. Backend är bakåtkompatibel med G och kan lämnas kvar medan frontend återställs. Återställ sedan föregående Vercel-deployment om även backend ska backas. Katalog-nyckeln `taxi_train_stations_v1` är ofarlig offentlig metadata; radera den vid behov. Ingen databas att återställa.
