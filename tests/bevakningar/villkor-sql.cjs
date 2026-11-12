// Kör: PGLITE=/workspace/pgtest/node_modules/@electric-sql/pglite node tests/bevakningar/villkor-sql.cjs
// Migrationen 20261112c + ångra i PGlite med attrapper för session_actor/is_demo. Ingen riktig databas.
const {PGlite}=require(process.env.PGLITE||'/workspace/pgtest/node_modules/@electric-sql/pglite'); const fs=require('fs');
const R=require('node:path').join(__dirname,'../../supabase/migrations/');
(async()=>{ const db=new PGlite();
 await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
  create table public.drivers(id text primary key); insert into public.drivers values ('900001'),('900002');
  create table private.sess(token text, driver_id text);
  insert into private.sess values ('tD','900001'),('tE','900002');
  create function private.session_actor(p text) returns table(driver_id text) language sql as $$ select driver_id from private.sess where token=p $$;
  create function private.is_demo() returns boolean language sql as $$ select false $$;`);
 await db.exec(fs.readFileSync(R+'20261112c_bev_villkor.sql','utf8'));
 await db.exec(fs.readFileSync(R+'20261112c_bev_villkor.sql','utf8')); // idempotent
 const q=async s=>(await db.query(s)).rows[0];
 console.log('get tom', JSON.stringify(await q(`select public.bev_villkor_get('tD') r`)));
 console.log('save', JSON.stringify(await q(`select public.bev_villkor_save('tD','{"v":1,"tag":{"default":{"sound":false,"lead_min":20}}}'::jsonb) r`)));
 console.log('get', JSON.stringify(await q(`select public.bev_villkor_get('tD') r`)));
 console.log('E ser inte D', JSON.stringify(await q(`select public.bev_villkor_get('tE') r`)));
 try { await q(`select public.bev_villkor_save('tD','[1]'::jsonb) r`); console.log('FAIL array accepted'); } catch(e){ console.log('array nekas:', e.message); }
 try { await q(`select public.bev_villkor_save('tD','{"tag":5}'::jsonb) r`); console.log('FAIL'); } catch(e){ console.log('tag måste vara objekt:', e.message); }
 console.log('svc', JSON.stringify(await q(`select public.bev_svc_villkor(array['900001','900002']) r`)));
 await db.exec(fs.readFileSync(R+'undo/20261112c_bev_villkor_undo.sql','utf8'));
 console.log('undo ok', (await db.query(`select count(*) from pg_proc where proname like 'bev_%villkor%'`)).rows[0]);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
