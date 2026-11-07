# Kategori-byte (2026-11-07) – ångra

Även: öppen anmälan i Ändra-läge döljer flikar och bilrad (verkstad.js draw/closeEdit, inkorg.js I.back, index.html popstate). Ångras med samma revert.

Inga befintliga rader ändrades (anmälan 21 lämnades orörd – det var ett test).

Backup-gren: `backup/pre-kategori-byte-20261107` (main före ändringen).

## Ångra koden
    git revert <commit>   # ingen force push

## Ångra databasen (bara en ny funktion lades till)
    drop function if exists public.set_car_issue_kind(text, bigint, text, text);

## Ångra ett enskilt kategoribyte
Loggen `activity_log` har händelsen `bil_issue_kind` med `from`, `from_supply`. Sätt tillbaka:
    update public.car_issues set kind = '<from>', supply_type = <from_supply eller null> where id = <id>;
