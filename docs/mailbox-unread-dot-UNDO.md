# Olästprickar – fix 2026-11-07

Backup: `backup/pre-mailbox-dot-fix-20261107`.
Ångra denna fixcommit med `git revert <unread-dot-fix-commit>` och `git push origin HEAD:main`.
Ingen databasändring eller migrering. Ingen Nyheter-rad.

Orsak: `needs` (ärendet väntar på svar/åtgärd) räknades både som olästprick och aktivitetsantal. Den flaggan försvinner inte när man läser. Nu styr den bara gruppering; prick och antal styrs av aktuella användarens `unread` eller personliga Markera som oläst.

Öppning inväntar både personlig mark_read och äldre case_seen före listuppdatering. Äldre långsamma listanrop får inte skriva över nyare lässtatus. Adminstart anropar nu den asynkrona refresh-metoden i stället för att använda .then på ett synkront antal. Profilens befintliga separata påminnelse om ofullständig profil bevaras.

Verifiering: endast aggregerade produktionsläsningar för Christian, inga kundnamn/telefoner eller sessioner. Befintliga läsmarkeringar fanns, ingen manuell olästflagga och inga olästa ärendenotiser. Tester: `node tests/admin-arenden/unread.cjs` och `node tests/admin-arenden/ui.cjs` – förare/admin, nya och äldre trådar, manuellt oläst, väntar-på-svar utan prick, profil/menybadge och långsamt gammalt listanrop. Bilärende 21 orört.
