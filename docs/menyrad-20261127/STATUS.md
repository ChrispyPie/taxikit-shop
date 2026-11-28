# Menyrad som i Mina bevakningar – status
Mål: samma verktygsrad som Mina bevakningar (`.mb-toolbar` i delad `TaxiData/menyrad.css`): enhetsknapp som växlar vy, ‹ datumruta ›, idag-knapp. Datumrutan öppnar period-/datumväljaren (ingen separat 📅-knapp). Kosmetiskt, ingen Nyheter-post.

## Gjort
1. **Topplista/Rekord** — PR #266, cache `20261127menyrad1`. Backup: `backup/main-before-menyrad1-20261127`.
2. **Körpassdata** — PR #268, cache `20261127menyrad2`. Gamla flikar dolda (`#kp-tabs`). Backup: `backup/main-before-menyrad2-20261127`.
3. **Åkeridata** (`akeridata.html`) — PR #269, cache `20261127menyrad3`. Backup: `backup/main-before-menyrad3-20261127`.
4. **📅 borttagen, datumrutan öppnar väljaren** (Körpassdata, Åkeridata, Topplista) — PR #273, cache `20261128menyrad4`. Mina bevakningar hade redan datumrutan som väljare; kugghjulet till höger är ljud/notiser och lämnades kvar. Test: `tests/arenden-20261127/menyrad4.py` (360+390 px). Skärmbilder: `/workspace/anim-preview/menyrad4/`. Backup: `backup/main-before-menyrad4-20261128`.
5. **Kalender + Lönekoll + delad CSS** — PR #274, cache `20261128menyrad5`. Kalender: enhetsknapp, datumrutan öppnar "Gå till datum". Lönekoll: samma rad utan enhetsknapp (bara månad, ingen egen kalender). `mina-bevakningar.css` använder delad `menyrad.css` för `.mb-toolbar`. Test: `tests/arenden-20261127/menyrad5.py`. Skärmbilder: `/workspace/anim-preview/menyrad5/`. Backup: `backup/main-before-menyrad5-20261128`.

## Kvar (annan typ av rad, inte datum-/vynav)
- **Prognos:** flikrad Schema/Morgon/Historik/Original + verktygsrad Filter/Bevakningar. Inte samma mönster som datumraden.
- **Ankomster:** källflikar Flyg/Tåg/Båt och typ-chips. Ingen datumrad.
- **Verkstad:** kategoriflikar Fel/Behövs/Underhåll/Uppgifter/Timmar/Sjuk + notisklocka. Ingen datumrad; ev. chips senare.
- **Forum:** ingen flik- eller datumrad. Hoppa över.

## Ångra
`git revert -m 1 <merge-commit>` på aktuell PR, höj cache. Ingen SQL. Kopior även i `/workspace/backups/UNDO-menyrad-20261128.md`.
