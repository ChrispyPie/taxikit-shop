# Önskemål och idéer (Admin)

Ägaren (och S admin) skriver i Admin › 💡 Önskemål och idéer vad han vill ändra eller lägga till i appen.
Christian (och assistenten) läser det direkt i databasen och pratar igenom det **innan** något ändras.
Inget i appen ändras automatiskt.

- Vem ser rutan: bara ägare (`agare`) och S admin (`superadmin`). Vanliga förare och vanlig admin ser den inte.
- Varje åkeri ser bara sina egna önskemål.
- Max 30 önskemål per person och dygn, högst 2000 tecken per önskemål.
- Ägaren kan ta bort sitt eget önskemål så länge status är **Ny**.
- Demokonton ser två påhittade exempel och kan inte skicka.

## Databasen

- Tabell: `public.dev_wishes` (id, company_id, author_id, body, status, reply, created_at, updated_at).
  Ingen direkt åtkomst från appen (RLS utan policyer), bara via funktionerna nedan.
- Funktioner (alla tar `p_token`): `dev_wish_list`, `dev_wish_add(p_body)`, `dev_wish_delete(p_id)`.
- Status: `ny` (Ny), `last` (Läst), `planerad` (Planerad), `klar` (Klar), `inte_nu` (Inte nu).
- Migration: `supabase/migrations/20261028o_dev_wishes.sql`. Ångra: `supabase/migrations/undo/20261028o_dev_wishes_undo.sql`.

## Läsa nya önskemål (bara läsning)

```sql
select w.id, w.created_at at time zone 'Europe/Stockholm' as skickat, c.name as akeri,
       d.first_name || ' ' || d.last_name as av, w.status, w.body
from public.dev_wishes w
left join public.companies c on c.id = w.company_id
left join public.drivers d on d.id = w.author_id
where w.status = 'ny'
order by w.created_at;
```

Alla önskemål (även gamla): ta bort raden `where w.status = 'ny'`.

## Sätta status och svar

Görs först när Christian har pratat med ägaren. Svaret syns för ägaren under rubriken "Svar från Christian".

```sql
-- status: 'last' | 'planerad' | 'klar' | 'inte_nu'
update public.dev_wishes
   set status = 'planerad',
       reply  = 'Bra idé! Vi bygger det nästa vecka.'
 where id = 123;
```

Bara läst, utan svar: `update public.dev_wishes set status = 'last' where id = 123;`
(`updated_at` sätts automatiskt.)
