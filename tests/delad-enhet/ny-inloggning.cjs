/* Test för migration 20261114b_delad_ny_inloggning (t1594u), körs mot PGlite (Postgres i wasm).
 *  - Ny inloggning med samma förare + enhets-id (x-taxi-enhet) stänger den gamla sessionen.
 *  - Annan enhet eller annan förare påverkas inte; utan huvud stängs inget.
 *  - session_actor kastar invalid_session för delad session med avslutat pass utan att skriva,
 *    och session_delad_logout_reason stänger sessionen och sparar orsaken (inget rullas tillbaka).
 * Kör: PGLITE=/tmp/pgl/node_modules/@electric-sql/pglite node tests/delad-enhet/ny-inloggning.cjs */
const fs = require('fs'), path = require('path'), assert = require('assert');
const MIG = path.join(__dirname, '../../supabase/migrations/20261114b_delad_ny_inloggning.sql');
const UNDO = path.join(__dirname, '../../supabase/migrations/undo/20261114b_delad_ny_inloggning_undo.sql');

const STUB = `
create schema private; create schema extensions;
create function extensions.crypt(p text, h text) returns text language sql as $$ select case when p = 'pw' then h else 'x' end $$;
create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$ select decode(md5(random()::text || clock_timestamp()::text), 'hex') $$;
create table public.drivers(id text primary key, category text, activated boolean, password_hash text, first_name text, last_name text, logged_in boolean, last_login_at timestamptz);
create table public.activity_log(id serial, action text, actor_id text, target_id text, details jsonb, created_at timestamptz default now());
create table private.demo_accounts(driver_id text, demo_of text, ended_at timestamptz, expires_at timestamptz);
create table private.sessions(token_hash text primary key, driver_id text, via_master boolean default false, created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '24 hours', delad_enhet boolean default false, delad_since timestamptz, delad_endpoint text,
  delad_logout_reason text, delad_logout_at timestamptz, device_id uuid default gen_random_uuid(), last_seen_at timestamptz, device_ua text, device_label text);
create table private.delad_logouts(token_hash text primary key, reason text, at timestamptz, created_at timestamptz default now());
create table private.notes(driver text, reason text);
create table private.reason_ctl(driver text primary key, reason text);
create function private.norm_cat(c text) returns text language sql as $$ select coalesce(c, 'standard') $$;
create function private.norm_pw(p text) returns text language sql as $$ select p $$;
create function private.token_hash(t text) returns text language sql as $$ select md5(t) $$;
create function private.is_demo() returns boolean language sql as $$ select false $$;
create function private.log(a text, r text, act text, tgt text, d jsonb, vm boolean) returns void language sql as $$ insert into public.activity_log(action, actor_id, target_id, details) values (act, a, tgt, d) $$;
create function private.request_meta(out ip text, out user_agent text, out device_id text) language plpgsql stable as $$
declare h json; v text; begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is null then return; end if; v := h->>'x-taxi-enhet'; if v ~ '^[A-Za-z0-9-]{8,64}$' then device_id := v; end if; end $$;
create function private.delad_enhet_reason(p_driver text, p_since timestamptz) returns text language sql stable as $$ select reason from private.reason_ctl where driver = p_driver $$;
create function private.delad_enhet_notify(d text, r text, a timestamptz, eps text[]) returns void language sql as $$ insert into private.notes values (d, r) $$;
create function private.delad_enhet_logout_text(r text, a timestamptz) returns text language sql as $$ select 'utloggad ' || r $$;
CREATE FUNCTION private.delad_enhet_close_session(p_hash text, p_reason text, p_notify boolean DEFAULT true) RETURNS boolean LANGUAGE plpgsql AS $f$
declare r record; begin
  if coalesce(p_hash, '') = '' or coalesce(p_reason, '') not in ('pass', 'stale', 'remote') then return false; end if;
  update private.sessions s set expires_at = now(), delad_logout_at = now(), delad_logout_reason = p_reason
   where s.token_hash = p_hash and s.expires_at > now() and s.delad_enhet
  returning s.driver_id, s.token_hash, s.delad_endpoint, s.delad_logout_reason as reason, s.delad_logout_at as at into r;
  if r.token_hash is null then return false; end if;
  insert into private.delad_logouts (token_hash, reason, at) values (r.token_hash, r.reason, r.at)
  on conflict (token_hash) do update set reason = excluded.reason, at = excluded.at;
  if coalesce(p_notify, true) then perform private.delad_enhet_notify(r.driver_id, r.reason, r.at, array_remove(array[r.delad_endpoint], null)); end if;
  return true; end $f$;
insert into public.drivers values ('101','standard',true,'H','Christian','C',false,null), ('202','standard',true,'H','Berra','B',false,null);
`;

(async () => {
  let PGlite;
  try { ({ PGlite } = require(process.env.PGLITE || '@electric-sql/pglite')); }
  catch (e) { console.log('SKIP: PGlite saknas (sätt PGLITE=...)'); return; }
  const db = new PGlite();
  await db.exec(STUB);
  // Ladda befintliga live-definitioner (= undo-filen) först, sedan migrationen ovanpå.
  await db.exec(fs.readFileSync(UNDO, 'utf8').replace(/drop index[^;]*;|alter table private\.sessions drop[^;]*;/g, ''));
  await db.exec(fs.readFileSync(MIG, 'utf8'));

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const login = async (id, enhet, delad) => {
    await db.exec(`select set_config('request.headers', '${enhet ? JSON.stringify({ 'x-taxi-enhet': enhet }) : ''}', false)`);
    const r = (await q(`select public.login($1, 'pw', $2) j`, [id, !!delad]))[0].j;
    assert.ok(r.ok, JSON.stringify(r));
    return r.token;
  };
  const active = async (id) => (await q(`select count(*)::int n from private.sessions where driver_id = $1 and expires_at > now()`, [id]))[0].n;

  const E1 = 'aaaaaaaa-1111-2222-3333-444444444444', E2 = 'bbbbbbbb-1111-2222-3333-444444444444';
  const t1 = await login('101', E1, true);
  assert.strictEqual(await active('101'), 1);
  const t2 = await login('101', E1, true);              // samma platta igen
  assert.strictEqual(await active('101'), 1, 'gamla sessionen på samma enhet ska stängas');
  const open = await q(`select token_hash from private.sessions where driver_id='101' and expires_at > now()`);
  assert.strictEqual(open[0].token_hash, (await q(`select md5($1) h`, [t2]))[0].h);
  const lg = await q(`select details from public.activity_log where action='login' order by id desc limit 1`);
  assert.deepStrictEqual(lg[0].details, { ersatte_sessioner: 1 });
  // gammal token ger inget "utloggad"-meddelande (inte en pass-utloggning)
  assert.strictEqual((await q(`select public.session_delad_logout_reason($1) j`, [t1]))[0].j.ended, false);

  await login('101', E2, false);                        // telefonen
  assert.strictEqual(await active('101'), 2, 'annan enhet påverkas inte');
  await login('202', E1, true);                         // Berra på samma platta
  assert.strictEqual(await active('101'), 2, 'annan förare påverkas inte');
  await login('101', null, false); await login('101', null, false);
  assert.strictEqual(await active('101'), 4, 'utan enhets-id stängs inget');
  console.log('ok  ny inloggning stänger bara samma förare + samma enhet');

  // Startkontrollen: passet slut för 101 -> session_actor kastar, och stängningen ska inte rullas tillbaka.
  await db.exec(`insert into private.reason_ctl values ('101','pass')`);
  let err = null;
  await db.exec('begin');
  try { await q(`select * from private.session_actor($1)`, [t2]); } catch (e) { err = e; }
  await db.exec('rollback');                            // som PostgREST gör vid fel
  assert.ok(err && /invalid_session/.test(err.message), 'session_actor ska neka');
  assert.strictEqual(err.hint, 'delad_pass');
  const r = (await q(`select public.session_delad_logout_reason($1) j`, [t2]))[0].j;
  assert.strictEqual(r.ended, true); assert.strictEqual(r.reason, 'pass');
  const s = await q(`select expires_at <= now() closed, delad_logout_reason from private.sessions where token_hash = md5($1)`, [t2]);
  assert.ok(s[0].closed); assert.strictEqual(s[0].delad_logout_reason, 'pass');
  assert.strictEqual((await q(`select count(*)::int n from private.delad_logouts where token_hash = md5($1)`, [t2]))[0].n, 1);
  assert.strictEqual((await q(`select count(*)::int n from private.notes where driver='101'`))[0].n, 1, 'push-notis en gång');
  // andra anropet: inga dubbla notiser
  await q(`select public.session_delad_logout_reason($1) j`, [t2]);
  assert.strictEqual((await q(`select count(*)::int n from private.notes`))[0].n, 1);
  // icke-delad session för 101 påverkas inte av reason
  console.log('ok  startkontrollen stänger sessionen utan att något rullas tillbaka');

  // Undo går att köra
  await db.exec(fs.readFileSync(UNDO, 'utf8'));
  assert.strictEqual((await q(`select count(*)::int n from information_schema.columns where table_schema='private' and table_name='sessions' and column_name='client_enhet'`))[0].n, 0);
  console.log('ok  undo');
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
