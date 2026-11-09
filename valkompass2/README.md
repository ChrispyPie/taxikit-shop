# Valkompass 2.0 (testversion, noindex)

Ny version byggd från grunden. Gamla `valkompass/` och `valkompass-old/` är orörda och fortsätter vara live.

**Mål:** hjälpa folk att förstå vad de själva faktiskt tycker – inte vad de tror att de tycker på grund av vänner och sociala medier – och visa vad partierna faktiskt säger och röstar, med källor.

## Struktur
- `index.html` – appen (start → gissning → frågor → värderingar → resultat). `noindex` tills lansering, ingen länk från andra sidor.
- `om.html` – metod, neutralitet, källor, kontakt (TODO), Ko-fi (TODO-länk)
- `css/style.css` – all stil (systemtypsnitt, neutrala färger)
- `js/score.js` – ren logik (matchning, förklaringar, kompass, frågeordning, delningslänk). Används av både appen och testerna.
- `js/app.js` – gränssnittet. Sparar svar i localStorage (`vk2-state-v1`). Delat resultat ligger i URL-hashen (`#r1.<parti>.<koder>`), ingen server.
- `tests/test_score.mjs` – `node valkompass2/tests/test_score.mjs`: varje parti mot sig självt (100 %, plats 1), 10 000 slumpanvändare, delningslänk, frågeordning, kompassplacering.
- `data/parties.json` – de 8 riksdagspartierna
- `data/axes.json` – 7 axlar
- `data/statements.json` – påståenden (utkast)
- `data/positions.json` – partipositioner med källa (tom än så länge)
- `data/values.json` – allmänna värderingsfrågor (`v-`) för den politiska kompassen
- `data/compass.json` – kompassens axlar och hur partierna placeras

## Två delar i testet
1. **Partimatchning** – politiska påståenden (`s-`) i `statements.json`. Jämförs mot partiernas källbelagda positioner.
2. **Politisk kompass** (vänster–höger × frihetlig–auktoritär) – allmänna värderingsfrågor (`v-`) i `values.json`, inte knutna till svensk politik. Påverkar **aldrig** matchningsprocenten.
   Partierna placeras på kompassen utifrån sina positioner på de politiska påståendena: ekonomi → x; värderingar, lag och ordning, migration → y. Se `compass.json`.

## Frågetyper (type)
- `statement` – påstående, svar Helt emot … Helt för.
- `scenario` – kort vardaglig berättelse (2–3 meningar). Man svarar på en 5-gradig skala mellan två tydliga ändar (`leftLabel`/`rightLabel`). `rightPole` visar vilken axelpol högerändan pekar mot; den varierar så att inget mönster syns. Räknas i partimatchningen bara när partiet har en källbelagd position.

## Nivåer (tier)
- `core` – grundtestet, ~30 politiska påståenden plus kompassfrågorna. Alla får samma; de första 10 är där valt parti har sin tydligaste profil.
- `deep` – framtida valfritt **Djupdyk**-läge med fler påståenden (totalt 60–100). Läggs till med `"tier": "deep"` utan att grundtestet eller kompassplaceringen ändras.

`approved: true` = godkänt av Christian.

## Arbetsflöde
- Allt arbete sker på grenen `valkompass2`. Inget går live förrän grenen slås ihop med `main`.
- Backup av `main` före start: taggen `valkompass-backup-2026-11-09`.

## Ångra
### Appen (2026-11-09)
- Backup före appbygget: taggen `valkompass2-before-app-20261109` (grenen `valkompass2`).
- Backup av `main` innan valkompass2 gick live: taggen `main-backup-before-vk2-live-20261109`.
- Ta bort valkompass2 från live: `git revert <commit som lade in valkompass2 på main>` och pusha som vanligt (ingen force push). Bara mappen `valkompass2/` påverkas.
- Ångra en ändring på grenen: `git revert <commit>` på `valkompass2`.
### Tidigare
- Ta bort grenen: `git push origin --delete valkompass2`
- Om något redan har slagits ihop med main: `git revert <commit>` (ingen force push).
- Jämför med backup: `git diff valkompass-backup-2026-11-09 main`

## Verktyg (`tools/`)
- `build_positions.py positions.json nya.json` – lägger in ett partis positioner. Varje källa hämtas och citatet måste finnas ordagrant, annars stoppas inläggningen.
- `omr.py <betänkande-URL>` – röster per parti för alla huvudvoteringar i ett betänkande (data.riksdagen.se).
- `punkt.py <betänkande-URL> <del-av-namn>` – visar vad en viss votering gällde.
- `quotes.py <betänkande-URL> [del-av-URL ...]` – visar den ordagranna raden "Utskottets förslag mot reservation …" för varje votering (används som citat).
- `sanity.py` – kontrollerar att varje partis egna svar ger 100 % för just det partiet.
