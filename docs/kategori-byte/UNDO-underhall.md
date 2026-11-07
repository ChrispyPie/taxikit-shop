# Kategori → Underhåll (utkast, PR) – ångra

Backup-gren: `backup/pre-kategori-underhall-20261107`.

## Ångra en enskild flytt (läs `activity_log` händelse `bil_issue_to_maint`: issue, maint, from_status, from_blocking)
    update public.car_issue_photos set maint_id = null, issue_id = <issue> where maint_id = <maint>;
    update public.car_issues set status = '<from_status>', blocking = <from_blocking>, closed_at = null, status_comment = null where id = <issue>;
    delete from public.car_maintenance where id = <maint>;   -- bara förslaget som flytten skapade

## Ta bort funktionen
    drop function if exists public.move_car_issue_to_maint(text, bigint, text, text);
    alter table public.car_maintenance drop column if exists from_issue_id;   -- först när inga flyttar behöver spåras
