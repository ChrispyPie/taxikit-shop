# Om appen – Mina bevakningar, 2026-11-07

Kosmetisk komplettering efter Christians godkännande 23:53 Europe/Stockholm (CET).
Backup pushad: `backup/pre-om-bevakningar-20261107` (main före ändringen).

Efter Forum finns nu 📌 **Mina bevakningar**, med texten: ”bevakade tåg och flyg, kalenderhändelser och bokade tider i en tidslinje eller lista”. Beskrivningen är kontrollerad mot `mina-bevakningar.js`: transportbevakningar, kalenderhändelser och bokningar hämtas och visas som tidslinje eller lista. Den nya länken använder `openItem('mina-bevakningar')` och befintlig lazy-loader.

Befintliga beskrivningar/ordning är oförändrade. De gamla funktionsnamnen är vanlig fet text, inte navigeringslänkar; den befintliga knappen Gå till Forum och Nyheter-reglaget har verifierats, liksom den nya Mina bevakningar-länken, från kall lazy-start i offline DOM. Alla 13 huvudvyer klarar även första öppning/omladdning. Inga JS-fel i dessa tester.

Ändrade JS-cacheversioner: `20261107omwatch1` för om-data, Om-renderaren och loadern. Ingen CSS-, databas- eller Nyheter-ändring.

Ångra: `git pull --rebase`, sedan `git revert <committen med "fix: add Mina bevakningar to About">` och normal push till main. Invänta lyckad Pages-publicering och kontrollera filerna. Ingen force push och inga dataändringar.
