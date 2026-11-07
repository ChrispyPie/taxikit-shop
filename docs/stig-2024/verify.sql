-- Aggregate-only verification: never emits source customer data.
WITH latest AS (
 SELECT DISTINCT ON (month,kind) id,month,kind,body FROM private.probe_reports
 WHERE month LIKE '2024-%' AND kind IN ('bf_resa','bf_pass') ORDER BY month,kind,id DESC
), lines AS (
 SELECT month,kind,string_to_array(line,';') a FROM latest,
 LATERAL regexp_split_to_table(body,E'\r?\n') WITH ORDINALITY x(line,n) WHERE n>1 AND line<>''
), trips AS (
 SELECT month,a[1] receipt,a[6] driver,nullif(a[8],'') car,
 substr(a[2],1,4)||'-'||substr(a[2],5,2)||'-'||substr(a[2],7,2) dt,
 jsonb_strip_nulls(jsonb_build_object(
 'kvittonr',a[1],'forar',a[6],'taxi',nullif(a[8],''),'startzon',nullif(a[20],''),'slutzon',nullif(a[21],''),
 'kilometer',replace(to_char(coalesce(nullif(a[18],'')::numeric,0)/10,'FM999990.0'),'.',','),
 'dricks',replace(to_char(coalesce(nullif(a[15],'')::numeric,0),'FM999990.00'),'.',','),
 'kredittyp',nullif(a[19],''),'belopp',replace(to_char(coalesce(nullif(a[10],'')::numeric,0),'FM999990.00'),'.',','),
 'starttid',case when length(a[3])>=4 then substr(a[3],1,2)||':'||substr(a[3],3,2) else '00:00' end,
 'sluttid',case when length(a[5])>=12 then substr(a[5],9,2)||':'||substr(a[5],11,2) else '00:00' end,
 'startdatum',substr(a[2],1,4)||'-'||substr(a[2],5,2)||'-'||substr(a[2],7,2))) d
 FROM lines WHERE kind='bf_resa' AND length(a[1])>=5 AND length(a[6])>=5 AND a[2] LIKE replace(month,'-','')||'%'
), shifts AS (
 SELECT month,a[2] shift,a[3] driver,substr(a[4],1,8) dt,
 jsonb_build_object('taxi',a[1],'passnr',a[2],'forar',a[3],
 'start',substr(a[4],1,8)||' '||substr(a[4],9,2)||':'||substr(a[4],11,2),
 'slut',substr(a[5],1,8)||' '||substr(a[5],9,2)||':'||substr(a[5],11,2),
 'tid',(SELECT (m/60)::text||':'||lpad((m%60)::text,2,'0') FROM (SELECT (((substr(a[5],9,2)::int*60+substr(a[5],11,2)::int)-(substr(a[4],9,2)::int*60+substr(a[4],11,2)::int))+1440)%1440 m) z),
 'resor',a[16],'inkort',a[17],'km',a[19]) d
 FROM lines WHERE kind='bf_pass' AND a[2]<>'' AND length(a[3])>=5 AND length(a[4])>=12 AND length(a[5])>=12
), stored AS (
 SELECT kvittonr receipt,forar driver,data->>'taxi' car,startdatum dt,data d,false replaced FROM private.arkiv_trips WHERE dataset='arkiv' AND startdatum LIKE '2024-%'
 UNION ALL
 SELECT kvittonr,forar,taxi,startdatum,data,true FROM private.ersatta_kvitton WHERE dataset='arkiv' AND startdatum LIKE '2024-%'
), trip_check AS (
 SELECT t.*,EXISTS(SELECT 1 FROM stored s WHERE s.car IS NOT DISTINCT FROM t.car AND s.receipt=t.receipt AND s.dt=t.dt AND s.driver=t.driver) present,
 EXISTS(SELECT 1 FROM stored s WHERE s.car IS NOT DISTINCT FROM t.car AND s.receipt=t.receipt AND s.dt=t.dt AND s.driver=t.driver AND s.d @> t.d) exact FROM trips t
), shift_check AS (
 SELECT t.*,EXISTS(SELECT 1 FROM private.arkiv_shifts s WHERE s.dataset='arkiv' AND s.passnr=t.shift AND s.forar=t.driver AND left(regexp_replace(s.start,'\D','','g'),8)=t.dt) present,
 EXISTS(SELECT 1 FROM private.arkiv_shifts s WHERE s.dataset='arkiv' AND s.passnr=t.shift AND s.forar=t.driver AND left(regexp_replace(s.start,'\D','','g'),8)=t.dt AND s.data @> t.d) exact FROM shifts t
), months AS (SELECT DISTINCT month FROM latest)
SELECT jsonb_build_object(
 'months',(SELECT jsonb_agg(jsonb_build_object('month',m.month,
 'source_trips',(SELECT count(*) FROM trips t WHERE t.month=m.month),
 'archive_trips',(SELECT count(*) FROM private.arkiv_trips t WHERE t.dataset='arkiv' AND t.startdatum LIKE m.month||'%'),
 'replaced_trips',(SELECT count(*) FROM private.ersatta_kvitton t WHERE t.dataset='arkiv' AND t.startdatum LIKE m.month||'%'),
 'missing_trips',(SELECT count(*) FROM trip_check t WHERE t.month=m.month AND NOT present),
 'trip_value_mismatches',(SELECT count(*) FROM trip_check t WHERE t.month=m.month AND present AND NOT exact),
 'source_shifts',(SELECT count(*) FROM shifts t WHERE t.month=m.month),
 'archive_shifts',(SELECT count(*) FROM private.arkiv_shifts t WHERE t.dataset='arkiv' AND left(regexp_replace(t.start,'\D','','g'),6)=replace(m.month,'-','')),
 'missing_shifts',(SELECT count(*) FROM shift_check t WHERE t.month=m.month AND NOT present),
 'shift_value_mismatches',(SELECT count(*) FROM shift_check t WHERE t.month=m.month AND present AND NOT exact)
 ) ORDER BY m.month) FROM months m),
 'duplicate_archive_trip_keys',(SELECT count(*) FROM (SELECT data->>'taxi',kvittonr,startdatum FROM private.arkiv_trips WHERE dataset='arkiv' AND startdatum LIKE '2024-%' GROUP BY 1,2,3 HAVING count(*)>1) z),
 'duplicate_source_trip_keys',(SELECT count(*) FROM (SELECT car,receipt,dt FROM trips GROUP BY 1,2,3 HAVING count(*)>1) z),
 'duplicate_archive_shift_keys',(SELECT count(*) FROM (SELECT passnr,forar,left(regexp_replace(start,'\D','','g'),8) FROM private.arkiv_shifts WHERE dataset='arkiv' AND left(start,4)='2024' GROUP BY 1,2,3 HAVING count(*)>1) z),
 'duplicate_source_shift_keys',(SELECT count(*) FROM (SELECT shift,driver,dt FROM shifts GROUP BY 1,2,3 HAVING count(*)>1) z),
 'archive_rows_without_source',(SELECT count(*) FROM stored s WHERE NOT EXISTS(SELECT 1 FROM trips t WHERE t.car IS NOT DISTINCT FROM s.car AND t.receipt=s.receipt AND t.dt=s.dt AND t.driver=s.driver)),
 'archive2025_trip_hash',(SELECT md5(string_agg(md5(row(t.*)::text),'' ORDER BY ord)) FROM private.arkiv_trips t WHERE dataset='arkiv' AND startdatum LIKE '2025-%'),
 'archive2025_shift_hash',(SELECT md5(string_agg(md5(row(t.*)::text),'' ORDER BY ord)) FROM private.arkiv_shifts t WHERE dataset='arkiv' AND left(start,4)='2025')
) AS verification;
