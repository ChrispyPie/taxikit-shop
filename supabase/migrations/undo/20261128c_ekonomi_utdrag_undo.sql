-- Ångrar 20261128c_ekonomi_utdrag.sql. Tar bort utdragsfunktionerna och tabellen (filerna försvinner: exportera först om de behövs).
-- Återställer private.ekonomi_kostnader till definitionen i 20261128b (utan utdrag-nyckeln).
drop function if exists public.ekonomi_utdrag_bekrafta(text, bigint, numeric, numeric);
drop function if exists public.ekonomi_utdrag_ta_bort(text, bigint);
drop function if exists public.ekonomi_utdrag_hamta(text, bigint);
drop function if exists public.ekonomi_utdrag_ladda(text, date, text, text, text, numeric, jsonb);
drop function if exists messaging_private.ekonomi_utdrag_bekrafta(text, bigint, numeric, numeric);
drop function if exists messaging_private.ekonomi_utdrag_ta_bort(text, bigint);
drop function if exists messaging_private.ekonomi_utdrag_hamta(text, bigint);
drop function if exists messaging_private.ekonomi_utdrag_ladda(text, date, text, text, text, numeric, jsonb);
drop table if exists private.ekonomi_utdrag;

create or replace function private.ekonomi_kostnader(p_company text)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select jsonb_build_object(
    'manuella', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'kategori', k.kategori, 'namn', k.namn, 'belopp', k.belopp,
        'moms_pct', k.moms_pct, 'typ', k.typ, 'fran', k.fran, 'till', k.till, 'bil', k.bil, 'anteckning', k.anteckning) order by k.fran, k.id)
        from private.ekonomi_kostnad k where k.company_id = p_company and k.borttagen is null), '[]'::jsonb),
    'bilar', coalesce((select jsonb_agg(jsonb_build_object('bilnummer', c.bilnummer, 'modell', c.modell, 'bildtyp', c.bildtyp,
        'i_trafik', c.i_trafik, 'ur_trafik', c.ur_trafik,
        'inkopspris', c.inkopspris, 'livslangd_ar', c.livslangd_ar, 'rantor_ar', c.rantor_ar, 'skatt_ar', c.skatt_ar, 'service_ar', c.service_ar,
        'taxiavg_ar', c.taxiavg_ar, 'forsakring_ar', c.forsakring_ar, 'tvatt_ar', c.tvatt_ar) order by c.bilnummer) from public.cars c), '[]'::jsonb))
$function$;
