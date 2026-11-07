# Adminstart och laddning 2026-11-07

Backup: `backup/pre-admin-auth-speed-20261107`.
Undo: `git revert <admin-auth-speed-commit>` och `git push origin HEAD:main`. Ingen databasändring eller migrering. Inga Nyheter-rader.

## Orsak och fix
Appen använder egen token/RPC-inloggning, inte Supabase getSession/onAuthStateChange. Admin hade redan ett await för get_me men ignorerade dess fel. Därefter användes hela admin_list_drivers för att hitta den egna rollen. Varje nät-/serverfel i denna växande lista behandlades som Ingen behörighet. Förarlistans SQL läser distinkta förar-ID från hela trips och shifts.

Nu kommer roll och ID direkt från lyckad get_me. Neutral laddningsvy visas tills identiteten är bekräftad, både i huvudappen och admin. Ett automatiskt nytt försök görs; nät-/serverfel visar Prova igen, aldrig Ingen behörighet. Bekräftat icke-admin nekas först efter andra kontrollen. Ingen tillgång ges utan serverbekräftelse och varje data-RPC behåller sin behörighetskontroll. Varje rollanrop har timeout.

Förarlistan hämtas först när Chaufförer öppnas (med delat pågående anrop och separat felruta). Körpasshistorik hämtas först när Körpassdata öppnas, inte i bakgrunden bakom huvudmenyn. Funktionsflaggor blockerar inte längre huvudmenyn. Samtidiga mailbox-refresh delar ett anrop; läs-/skrivåtgärder tvingar färsk uppdatering så gamla olästflaggor inte kommer tillbaka.

## Mätning – produktion, endast läsning
Aggregerad pg_stat_statements, inte telefon-/nätverkstider:
- get_me: 19,92 ms medel; värsta 2226,45 ms.
- admin_list_drivers: 248,30 ms medel; värsta 2393,04 ms.
- admin_driver_last_drive: 468,85 ms medel; värsta 1810,12 ms (redan begränsad till Chaufförer).
- get_my_trip_data: 234,13 ms medel; värsta 2894,78 ms.
- get_trip_data (fallback): 314,27 ms medel; värsta 2920,12 ms.
- mailbox_v2: 30,45 ms medel; case_admin_list: 42,02 ms medel.

Deterministiskt före-/eftertest med dessa medelkostnader: adminens kritiska databasväg 268,22 → 19,92 ms. Detta är en modell, INTE uppmätt Android-laddning. Adminstartens blockerande RPC:er minskar från två till ett. Förardata-prefetch minskar från ett historikanrop till noll bakom menyn. Dubbla mailbox-refresh minskar från två batchar (tio RPC:er) till en (fem RPC:er). Laddningsmått utan persondata finns i window.TAXI_BOOT_METRICS.

Huvudsidan laddar fortfarande ca 928 kB avkodad JavaScript i 32 filer; admin ca 151 kB i 13 filer plus stor inline-HTML. Ingen riktig browser-waterfall eller Android-tid har uppmätts. Relevant indexering för dataset/förare och meddelanden finns redan. Pollers är huvudsakligen enkelinstanser med visibility-kontroll; inget belägg för växande intervall-läcka hittades. Inga telefonens lokala data har lästs eller raderats.

STIG-samband är inte bevisat; den enda matchande statistikposten räcker inte för att bedöma ingest-timeouts. Större uppföljning: paginerad/smalare förarlista, serveraggregerade personliga perioder, mindre badge-RPC och uppdelning av JS per verktyg. Inga riskabla SQL-/arkivändringar gjordes nu.

Tester: node tests/boot/admin.cjs; node tests/admin-arenden/ui.cjs; node tests/admin-arenden/unread.cjs. Syntetiska roller, tillfälligt/offline fel, omförsök, stale lokalt ID, nekad vanlig förare, icke-blockerande funktionsflaggor, neutral startsida, dubblettanrop och oläst-regression. Bilärende 21 orört. Riktig Android-verifiering återstår.
