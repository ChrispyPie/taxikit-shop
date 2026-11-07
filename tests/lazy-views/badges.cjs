// Extend the existing synthetic role/RLS suite in-process. No production reads or writes.
const fs=require('fs'),path=require('path'),Module=require('module');
const base=path.resolve(__dirname,'../inkorg-v2/bulk-db.cjs');
const injection=`
 await db.exec(\`create function public.get_me(p_token text) returns jsonb language plpgsql as $$declare a record;begin select * into a from private.bil_actor(p_token);return jsonb_build_object('id',a.driver_id,'category',a.category);end$$;
 create function public.bil_badge(p_token text) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.forum_classic_badge(p_token text) returns integer language sql as $$select 0$$;
 create function public.prognos_new_count(p_token text,p_cats text[] default null) returns integer language sql as $$select 0$$;
 create function public.changelog_seen_get(p_token text) returns text language sql as $$select '2026-11-07k'::text$$;\`);
 await sql('supabase/migrations/20261107204952_shell_badge_counts.sql');
 const counts=who=>scalar('select shell_badge_counts($1)',[who]);
 for(const who of ['driver','admin','owner','super']){const d=await counts(who);ok(Number.isInteger(d.messages));ok(Number.isInteger(d.admin));ok(Object.keys(d).sort().join(',')==='admin,bil,forum,messages,news_seen,notices,prognos');}
 await denied('select shell_badge_counts($1)',['invalid'],'28000');
 const cthread=await fresh(),citem={kind:'thread',id:cthread.id};
 let start=(await counts('driver')).messages;
 await call('owner','reply',{admin:true,thread_id:cthread.id,body:'Synthetic unread badge'});
 assert.equal((await counts('driver')).messages,start+1,'new unread expected');
 await call('driver','get',{thread_id:cthread.id});await call('driver','mark_read',citem);assert.equal((await counts('driver')).messages,start,'read/hidden expected');
 await call('driver','mark_unread',citem);assert.equal((await counts('driver')).messages,start+1,'new unread expected');
 await bulk('hide',[citem]);assert.equal((await counts('driver')).messages,start,'read/hidden expected');
 await call('owner','reply',{admin:true,thread_id:cthread.id,body:'Synthetic resurrect'});assert.equal((await counts('driver')).messages,start+1,'new unread expected');
 await sql('supabase/migrations/undo/20261107204952_shell_badge_counts_undo.sql');
 console.log('PASS scalar badge function, role authorization, exact unread/manual/hidden/resurrected state and additive undo (isolated PostgreSQL).');
`;
let source=fs.readFileSync(base,'utf8').replace(" await sql('supabase/migrations/undo/20261107191742_mailbox_bulk_preferences.sql');",()=>injection+" await sql('supabase/migrations/undo/20261107191742_mailbox_bulk_preferences.sql');");
const m=new Module(base,module);m.filename=base;m.paths=Module._nodeModulePaths(path.dirname(base));m._compile(source,base);
