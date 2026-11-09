# Valkompass 2.0 (under uppbyggnad)

Ny version byggd från grunden. Gamla `valkompass/` och `valkompass-old/` är orörda och fortsätter vara live.

**Mål:** hjälpa folk att förstå vad de själva faktiskt tycker – inte vad de tror att de tycker på grund av vänner och sociala medier – och visa vad partierna faktiskt säger och röstar, med källor.

## Struktur
- `index.html` – platshållare (noindex)
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

## Nivåer (tier)
- `core` – grundtestet, ~30 politiska påståenden plus kompassfrågorna. Alla får samma; de första 10 är där valt parti har sin tydligaste profil.
- `deep` – framtida valfritt **Djupdyk**-läge med fler påståenden (totalt 60–100). Läggs till med `"tier": "deep"` utan att grundtestet eller kompassplaceringen ändras.

`approved: true` = godkänt av Christian.

## Arbetsflöde
- Allt arbete sker på grenen `valkompass2`. Inget går live förrän grenen slås ihop med `main`.
- Backup av `main` före start: taggen `valkompass-backup-2026-11-09`.

## Ångra
- Ta bort grenen: `git push origin --delete valkompass2`
- Om något redan har slagits ihop med main: `git revert <commit>` (ingen force push).
- Jämför med backup: `git diff valkompass-backup-2026-11-09 main`
