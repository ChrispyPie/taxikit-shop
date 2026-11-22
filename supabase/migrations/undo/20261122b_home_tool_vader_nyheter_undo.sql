-- Ångra 20261122b: återställ varje kontos tidigare modulordning
-- från private.home_tool_order_backup_20261122_vader_nyheter.
-- Layout som bara fanns på enheten sparades i localStorage
-- (taxi_mod_uninst_vader_nyheter:<förar-id>:prev). Den här filen rör bara servern.
-- Hjälpfunktionerna som migrationen skapade tas bort efter återställningen.
-- Säkerhetskopian behålls så att ångringen kan köras igen vid behov.

update private.home_tool_order t
set ids = b.ids,
    hidden = b.hidden,
    folders = b.folders,
    pos = b.pos,
    updated_at = b.updated_at
from private.home_tool_order_backup_20261122_vader_nyheter b
where t.driver_id = b.driver_id;

insert into private.home_tool_order (driver_id, ids, hidden, folders, pos, updated_at)
select b.driver_id, b.ids, b.hidden, b.folders, b.pos, b.updated_at
from private.home_tool_order_backup_20261122_vader_nyheter b
where not exists (
  select 1 from private.home_tool_order t where t.driver_id = b.driver_id
);

drop function if exists private.home_tool_pos_without(jsonb, text[]);
drop function if exists private.home_tool_folders_without(jsonb, text[]);
drop function if exists private.home_tool_textarr_without(text[], text[]);
