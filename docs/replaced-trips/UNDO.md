# Ångra visning av ersatta kvitton (2026-11-10)

Backupgren av main: `backup/pre-show-replaced-receipts-20261110`.

## SQL (kör bara om migrationen har körts i Supabase)

```sql
drop function if exists public.get_replaced_trips(text, text);
```

Fil: `supabase/migrations/undo/20261110a_replaced_trips_ui_undo.sql`

## Kod
Stäng utkast-PR:n om den inte är mergad. Efter ev. merge: `git revert` av merge-committen, ingen force push.
