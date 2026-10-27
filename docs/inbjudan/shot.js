const { chromium } = require('/workspace/livecheck/node_modules/playwright');
const ROOT = '/workspace/taxikit-shop/TaxiData', OUT = '/workspace/taxikit-shop/docs/inbjudan/';
const http = require('http'), fs = require('fs'), path = require('path');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); }).listen(18433);
const BASE = 'http://localhost:18433/';
const future = d => new Date(Date.now() + d * 864e5).toISOString();
let fails = 0;
function state() {
  return {
    '710022': { id: '710022', category: 'agare', first_name: 'Christian', last_name: 'Parsa', activated: true, pending: false, registered: true, last_login_at: future(0) },
    '700301': { id: '700301', category: 'standard', first_name: 'Ahmed', last_name: 'Karimi', activated: true, pending: false, registered: true, last_login_at: future(-1) },
    '700310': { id: '700310', category: 'standard', first_name: 'Ny', last_name: 'Förare', activated: false, pending: false, registered: true },  // namn ändrat, aldrig aktiverad (som 179890 innan)
    '700311': { id: '700311', category: 'standard', first_name: 'Väntande', last_name: 'Förare', activated: true, pending: true, registered: true, link_expires_at: future(6) },
  };
}
let S, calls;
(async () => {
  const b = await chromium.launch();
  const results = [];
  async function run(name, fn, opts = {}) {
    S = state(); calls = []; fails = opts.fail || 0;
    const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: 'dark' });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', 1); localStorage.clear();
      Object.entries({ taxi_theme: 'dark', taxi_session: 'mock', taxi_logged_in: '1', taxi_driver: '710022', admin_demo_hidden: '1' }).forEach(([k, v]) => localStorage.setItem(k, v)); } });
    await ctx.route('**/rest/v1/rpc/**', async route => {
      const name = route.request().url().split('/rpc/')[1];
      const a = JSON.parse(route.request().postData() || '{}');
      calls.push(name);
      if (opts.slow && (name === 'admin_activate')) await new Promise(r => setTimeout(r, 800));
      if (name === 'admin_activate' && fails > 0) { fails--; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'forbidden', code: '42501' }) }); }
      let body = null;
      if (name === 'get_me') body = { id: '710022', category: 'agare', first_name: 'Christian' };
      else if (name === 'admin_list_drivers') body = Object.values(S);
      else if (name === 'admin_list_demos') body = [];
      else if (name === 'admin_driver_last_drive') body = { from: '2026-01-01', drivers: {} };
      else if (name === 'workshop_pending_count') body = 0;
      else if (name === 'admin_activate') { const d = S[a.p_id]; if (d.activated && !d.pending) throw new Error('would wipe password'); Object.assign(d, { activated: true, pending: true, category: a.p_category, link_expires_at: future(7) }); body = { ok: true, category: a.p_category, link_token: 'EXEMPELTOKEN', expires_at: future(7) }; }
      else if (name === 'admin_new_activation_link') { body = { ok: true, link_token: 'EXEMPELTOKEN2', expires_at: future(7) }; S[a.p_id].link_expires_at = future(7); }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const p = await ctx.newPage();
    const dialogs = [];
    p.on('dialog', async d => { dialogs.push(d.type() + ': ' + d.message()); await d.accept(); });
    p.on('pageerror', e => console.log('PAGEERR', e.message));
    await p.goto(BASE + 'admin.html'); await p.waitForTimeout(900);
    await p.evaluate(() => openMenu('chaufforer')); await p.waitForTimeout(600);
    await fn(p);
    const modal = await p.$eval('#link-modal textarea', t => t.value).catch(() => null);
    results.push({ name, calls: calls.filter(c => c.startsWith('admin_') && c !== 'admin_list_demos' && c !== 'admin_driver_last_drive'), dialogs, modal });
    await ctx.close();
  }
  const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
  await run('1 aldrig aktiverad -> Dela inbjudan', async p => {
    await p.evaluate(() => editDriver('700310')); await p.waitForTimeout(300);
    await p.evaluate(() => window.scrollTo(0, 99999)); await p.waitForTimeout(200);
    await shot(p, '1_inaktiv-forare-dela-inbjudan');
    await p.click('#share-btn'); await p.waitForTimeout(700);
    await shot(p, '2_inbjudan-aktiveringslank');
  });
  await run('2 dubbeltryck', async p => {
    await p.evaluate(() => editDriver('700310')); await p.waitForTimeout(300);
    await p.evaluate(() => { shareDriver('700310'); shareDriver('700310'); }); await p.waitForTimeout(1500);
    await p.evaluate(() => { closeLinkModal(); shareDriver('700310'); }); await p.waitForTimeout(700);   // tredje tryck efteråt: samma länk, ingen ny aktivering
  }, { slow: true });
  await run('3 aktiv forare -> Dela', async p => {
    await p.evaluate(() => editDriver('700301')); await p.waitForTimeout(300);
    await p.evaluate(() => window.scrollTo(0, 99999)); await p.waitForTimeout(200);
    await shot(p, '3_aktiv-forare-dela');
    await p.click('#share-btn'); await p.waitForTimeout(600);
    await shot(p, '4_aktiv-forare-inloggningstext');
  });
  await run('4 vantande utan lank i sessionen', async p => {
    await p.evaluate(() => editDriver('700311')); await p.waitForTimeout(300);
    await p.click('#share-btn'); await p.waitForTimeout(700);
    await shot(p, '5_vantande-ny-lank');
  });
  await run('5 aktivering misslyckas', async p => {
    await p.evaluate(() => editDriver('700310')); await p.waitForTimeout(300);
    await p.click('#share-btn'); await p.waitForTimeout(700);
    await shot(p, '6_fel-ingen-delning');
  }, { fail: 1 });
  await run('6 namnandring sedan Dela', async p => {
    await p.evaluate(() => editDriver('700310')); await p.waitForTimeout(300);
    await p.fill('#f-first-name', 'Nytt'); 
    await p.click('#share-btn'); await p.waitForTimeout(700);
  });
  console.log(JSON.stringify(results, null, 1));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
