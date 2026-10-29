/* Demokonton (t369u–t373u).
 * Ett demokonto loggar in med eget ID (DEMO1, DEMO2 …) och ser en riktig förares siffror, bara läsning.
 * Servern sköter allt som är viktigt: sessionen läser som en utvald förare med kategori Standard,
 * alla skrivningar stoppas (demo_read_only), förarens namn och förar-ID blir "Demoförare", bilnummer
 * blir "Demobil 1, 2 …" (private.demo_mask, 20261027b), andra förares namn byts mot "Förare N" och kontot
 * slutar fungera när det gått ut. Den här filen sköter bara det som syns:
 *  - bannern "Demokonto (förare/ägare) – gäller till …"
 *  - inbjudningstexterna (delas från admin och visas på aktivera.html)
 *  - ägar-demots adminpanel med påhittade exempeluppgifter (inga admin-anrop går till servern)
 * Inga lösenord, koder eller nycklar finns här.
 */
(function () {
  'use strict';
  var D = window.DEMO = {};
  var KEY = 'taxi_demo';

  D.ROLE = { forare: 'förare', agare: 'ägare' };
  D.MSG = 'Det här är ett demokonto. Du kan titta runt men inte ändra något.';

  // ---- sparat läge (sätts i index.html efter get_me) ----
  D.get = function () {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.id ? v : null; } catch (e) { return null; }
  };
  D.set = function (me) {
    if (me && me.demo) {
      localStorage.setItem(KEY, JSON.stringify({ id: me.demo_id, role: me.demo_role === 'agare' ? 'agare' : 'forare',
        expires: me.demo_expires_at, first: me.demo_first_name || '', last: me.demo_last_name || '' }));
    } else localStorage.removeItem(KEY);
    return D.get();
  };
  D.clear = function () { localStorage.removeItem(KEY); };
  D.on = function () { return !!D.get(); };
  D.owner = function () { var d = D.get(); return !!d && d.role === 'agare'; };
  D.isErr = function (e) { return !!e && (e.message === 'demo_read_only' || e.message === 'via_master'); };

  D.when = function (t) {
    if (!t) return '';
    return new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  };

  // ---- banner ----
  D.bannerText = function (d) {
    d = d || D.get();
    if (!d) return '';
    return 'Demokonto (' + D.ROLE[d.role] + ') – gäller till ' + D.when(d.expires) + '. Du ser en riktig förares siffror, men namn och bilnummer är utbytta. Du kan bara titta.';
  };
  D.banner = function () {
    var d = D.get();
    var old = document.getElementById('demo-banner');
    if (!d) { if (old) old.remove(); return; }
    if (!old) {
      old = document.createElement('div');
      old.id = 'demo-banner';
      old.setAttribute('role', 'status');
      old.style.cssText = 'position:sticky;top:0;z-index:50;background:#744210;color:#fefcbf;font-size:13px;line-height:1.35;' +
        'padding:7px 12px;text-align:center;font-family:inherit';
      document.body.insertBefore(old, document.body.firstChild);
    }
    old.textContent = '🧪 ' + D.bannerText(d);
  };

  // ---- inbjudningstexter (samma text överallt: dela, kopiera, aktivera.html) ----
  // Ordet "hen" används inte.
  D.LOOK = {
    forare: 'Du får se appen precis som en av våra förare ser den: körpass och intäkter, lönekoll, prognos för bokningar, ' +
      'topplistor, kalender, forum och bil & verkstad. Förarens namn och bilnummer är utbytta, och andra förares namn visas inte.',
    agare: 'Du får se appen både som förare och som ägare: förarnas vy med körpass, lönekoll, prognos och topplistor, ' +
      'och ägarens adminpanel med chaufförer, bilar, verkstad och åkeridata. I adminpanelen visas påhittade exempeluppgifter, inte våra riktiga.'
  };
  D.intro = function (role, expires) {
    role = role === 'agare' ? 'agare' : 'forare';
    return 'Det här är en demo av vår förarapp TaxiData.\n\n' + D.LOOK[role] + '\n\n' +
      'Kontot gäller i 3 dagar' + (expires ? ' (till ' + D.when(expires) + ')' : '') + ' och du kan bara titta, inte ändra något.';
  };
  D.inviteText = function (role, url, expires) {
    role = role === 'agare' ? 'agare' : 'forare';
    return 'Hej! Här kommer en inbjudan till en demo av vår förarapp TaxiData.\n\n' + D.LOOK[role] + '\n\n' +
      'Kontot gäller i 3 dagar' + (expires ? ' (till ' + D.when(expires) + ')' : '') + ' och du kan bara titta, inte ändra något.\n\n' +
      'Öppna länken, skriv ditt namn och välj ett eget lösenord:\n' + url + '\n\nLänken fungerar en gång.';
  };

  // ---- ägar-demo: påhittade exempeluppgifter i adminpanelen ----
  // Används bara i webbläsaren. Servern ger aldrig en demosession adminbehörighet,
  // så inga riktiga uppgifter kan hämtas härifrån.
  var FAKE = [
    ['900101', 'agare', 'Exempel', 'Ägare'], ['900102', 'admin', 'Anna', 'Exempelsson'], ['900103', 'standard', 'Bengt', 'Provare'],
    ['900104', 'standard', 'Cecilia', 'Test'], ['900105', 'standard', 'David', 'Demo'], ['900106', 'semester', 'Eva', 'Exempel'],
    ['900107', 'standard', 'Fredrik', 'Prov', true], ['900108', 'avslutad', 'Gun', 'Gammal']
  ];
  function iso(daysAgo, h) { var d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h || 9, 0, 0, 0); return d.toISOString(); }
  D.fixture = function (name, args, me) {
    switch (name) {
      case 'get_me': return null;   // går till servern som vanligt
      case 'admin_list_drivers':
        return FAKE.map(function (f, i) {
          return { id: i === 0 ? me : f[0], category: f[1], first_name: f[2], last_name: f[3], activated: f[1] !== 'avslutad',
            pending: !!f[4], registered: true, address: 'Exempelgatan ' + (i + 1), postal_code: '000 00', city: 'Exempelstad',
            email: 'exempel' + (i + 1) + '@exempel.se', phone: '070-000 00 0' + i, last_login_at: iso(i, 8) };
        });
      case 'admin_driver_last_drive': {
        var ago = [0, 1, 3, 9, 2, 75, null, 200], m = {};
        FAKE.forEach(function (f, i) { if (ago[i] !== null) m[i === 0 ? me : f[0]] = iso(ago[i], 12).slice(0, 10); });
        return { from: iso(300, 12).slice(0, 10), drivers: m };
      }
      case 'admin_list_demos': {
        var d = D.get() || {};
        return [{ id: d.id || 'DEMO1', role: 'agare', first_name: d.first || 'Du', last_name: d.last || '', status: 'active', expires_at: d.expires, created_at: iso(0, 8) },
                { id: 'DEMO9', role: 'forare', first_name: 'Exempel', last_name: 'Demo', status: 'ended', expires_at: iso(2, 8), ended_at: iso(2, 8), created_at: iso(5, 8) }];
      }
      case 'admin_get_log':
      case 'admin_log_page':
      case 'admin_log_page_v2': {
        var rows = [
          { id: 4, time: iso(0, 9), actor_id: me, actor_role: 'agare', action: 'login', target_id: me, details: {} },
          { id: 3, time: iso(0, 8), actor_id: me, actor_role: 'agare', action: 'driver_edit', target_id: '900104', details: { fields: ['phone'] } },
          { id: 2, time: iso(1, 14), actor_id: me, actor_role: 'agare', action: 'activate', target_id: '900107', details: {} },
          { id: 1, time: iso(2, 7), actor_id: '900103', actor_role: 'standard', action: 'login', target_id: '900103', details: {} }];
        if (name === 'admin_log_page_v2') {   // påhittad enhet och webbläsare, ingen IP i demot
          var ua = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
          rows.forEach(function (r) { r.device = r.actor_id === me ? 'demo0000-0000-4000-8000-000000000001' : 'demo0000-0000-4000-8000-000000000002'; r.ua = ua; });
          var s = args && args.p_sok;
          if (s) rows = rows.filter(function (r) { return r.device.indexOf(s) === 0; });
          return { rows: args && args.p_before ? [] : rows, more: false, ip: false };
        }
        return name === 'admin_get_log' ? rows : { rows: args && args.p_before ? [] : rows, more: false };
      }
      case 'list_cars':
        return { can_edit: true, fuel: { prices: {}, config: { el_surcharge: 0, el_home_share: 100 } }, cars: [
          { id: 1, bilnummer: '9001', modell: 'Exempelbil Kombi', regnr: 'ABC 123', kategorier: ['app', 'storbil'], fuel: 'el', cons: 1.8, price_mode: 'auto', calc: { mode: 'auto', kr_per_mil: 3.2 } },
          { id: 2, bilnummer: '9002', modell: 'Provmodell Sedan', regnr: 'DEF 456', kategorier: ['app'], fuel: 'laddhybrid', cons: 0.3, cons_el: 1.2, el_share: 60, price_mode: 'auto', calc: { mode: 'auto', kr_per_mil: 6.4 } },
          { id: 3, bilnummer: '9003', modell: 'Demobuss', regnr: 'GHI 789', kategorier: ['storbil'], fuel: 'diesel', cons: 0.7, price_mode: 'auto', calc: { mode: 'auto', kr_per_mil: 13.1 } }] };
      case 'car_model_makes': return [];
      case 'car_model_variants': return [];
      case 'workshop_pending_count': return 1;
      case 'bil_open_count': return { supply: 2, fault: 1, msg: 1 };
      case 'car_issue_seen': return 0;
      case 'get_bil': {
        var ex = function (id, kind, car, sup, body, status, d, h, by, name, extra) {
          return Object.assign({ id: id, kind: kind, car: car, car_id: car ? id : null, supply: sup, body: body, status: status, blocking: false,
            created_at: iso(d, h), reporter: by, reporter_name: name, mine: false, photos: 0, history: [] }, extra || {});
        };
        return { is_admin: true, cars: [], maint: [], tasks: [], issues: [
          ex(901, 'supply', '9001', 'kvitto', 'Sista rullen i bilen (exempel)', 'ny', 0, 19, '900103', 'Bengt P'),
          ex(902, 'supply', '9002', 'annat', 'Ny laddkabel behövs, den gamla glappar (exempel)', 'ny', 1, 22, '900104', 'Cecilia T'),
          ex(903, 'supply', null, 'spolar', '', 'pagar', 2, 7, '900105', 'David D',
            { history: [{ status: 'pagar', comment: 'Köper en dunk i morgon (exempel)', at: iso(1, 10) }],
              msgs: [{ id: 1, role: 'driver', who: 'David D', body: 'Den är nästan slut i bil 9003 också (exempel)', at: iso(1, 12), mine: false }], unread: 1 }),
          ex(904, 'fault', '9003', null, 'Varningslampa för däcktryck lyser (exempel)', 'ny', 0, 3, '900103', 'Bengt P'),
          ex(905, 'supply', '9001', 'rengoring', 'Spillt kaffe i baksätet (exempel)', 'klar', 4, 18, '900105', 'David D',
            { closed_at: iso(3, 9), history: [{ status: 'klar', comment: 'Tvättad (exempel)', at: iso(3, 9) }] })] };
      }
      case 'admin_workshop_list':
        return { rate: 250, entries: [
          { id: 1, driver_id: '900103', namn: 'Bengt P', start: iso(1, 9), end: iso(1, 11), car: '9001', minutes: 120, kr: 500, status: 'pending', comment: 'Byte av torkarblad (exempel)', msgs: [] },
          { id: 2, driver_id: '900104', namn: 'Cecilia T', start: iso(3, 13), end: iso(3, 14), car: '9002', minutes: 60, kr: 250, status: 'approved', msgs: [] }],
          totals: [
            { driver_id: '900103', namn: 'Bengt P', approved_min: 180, approved_kr: 750, pending_min: 120, rejected_min: 0 },
            { driver_id: '900104', namn: 'Cecilia T', approved_min: 60, approved_kr: 250, pending_min: 0, rejected_min: 0 }] };
    }
    var e = new Error('demo_read_only'); e.code = '42501';   // alla ändringar i ägar-demot stoppas här (och på servern)
    throw e;
  };
})();
