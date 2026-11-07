# Profilfält – 7 november 2026

## Backup / ångra

Backup: `backup/pre-profil-falt-20261107` (publicerad till origin, bas 8073d66c).

1. Återställ frontend med `git revert <commit för "Profil: månad, zoner, språk och behörigheter">` på en ny branch eller main enligt gällande tillstånd. Ingen force push. Behåll senare ändringar och ge JS nya cacheversioner.
2. Vid behov kör `docs/profil-falt/undo.sql` i Supabase. Den återställer exakt tidigare profile_get(text,text) och profile_save(text,jsonb). Den nya kolumnen och sparade månadsvärden lämnas kvar: inget raderas.
3. Kontrollera profilvisning och sparande. Getter-wrappern profile_get(text) är oförändrad och anropar tvåargumentsfunktionen.

## Databas

`supabase/migrations/20261107015953_profile_fields_month.sql` tillför en nullable heltalskolumn taxi_start_month (1–12). Årsfältets befintliga synlighetsregel gäller även månaden. Gamla klienter som inte skickar månaden behåller den. Befintliga profiler skrivs inte om.

Språk/nivå och behörigheter återanvänder textkolumnerna. Språk sparas radvis som `svenska (Modersmål)`. Befintliga kända språk delas upp; okänd fri text bevaras. Behörigheter sparas läsbart kommaseparerat; tidigare okända uppgifter finns i ett separat textfält. Befintliga äldre områdesnamn visas som tidigare värde och bevaras tills föraren ändrar zonen.

Nya zonvärden valideras både i UI och RPC (1–999). Äldre identiska värden accepteras för bakåtkompatibilitet. Språk har fortsatt max 200 tecken totalt, behörigheter 400; UI/RPC visar fel i stället för tyst trunkering.

## Test

`node --check TaxiData/profil-sida.js` och `node --check TaxiData/profil-sprak.js`.

`/workspace/pwenv/bin/python docs/profil-falt/test_mobile.py` kör isolerade browsertester med syntetisk profil och mockade RPC:er, inga riktiga konton eller sessionsuppgifter. Skärmbilder är 390×844, under `/workspace/taxidata-cleanup/screenshots/profil-falt/`.

Testat: års-only kompatibilitet, månad/år roundtrip, zon 1/999/1000, språk + nivåer, gamla okända värden, behörigheter + serviceresor, synlighetsval, sparande utan att tappa formulärets ändringar, formuläret kvar efter nätfel och mobilbredd.

Databas kontrollerad: kolumnens typ, RLS fortfarande aktivt, månad/zon-validering och getter-wrapper, felaktig session nekas. Ingen riktig användarprofil har ändrats under testerna. Full inloggad produktionstest återstår.

Supabase security advisor visar befintliga RPC-varningar för anon/authenticated SECURITY DEFINER samt RLS utan direkta policies för driver_profiles. Detta är samma tokenkontrollerade RPC-modell som före ändringen; inga grants/policies har ändrats. Se https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable .

## Språklista

7 910 ISO 639-3-språk från Debian iso-codes; svenska CLDR-namn via Intl.DisplayNames där sådana finns, annars katalogens original-/engelska namn. Sökningen täcker hela katalogen, select visar högst 150 träffar plus befintligt valt värde för att inte belasta telefonen.

Källa: https://salsa.debian.org/iso-codes-team/iso-codes . Licens/copyright för källdatan finns bredvid detta dokument. Datasetet kan återskapas från `/usr/share/iso-codes/json/iso_639-3.json`; frontendkatalogen är en fristående datafil.
