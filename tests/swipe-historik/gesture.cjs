// Gesterna i swipe-back.js: höger från vänstra halvan = bakåt, vänster från mitten = framåt (bara om
// det finns något framåt), vänster från högra kanten (24 px) lämnas till notispanelen i notis.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeEnv, makeApp, load, root } = require('./harness.cjs');

function setup() {
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  env.win.NOTIS = { isOpen: () => false };
  env.ctx.NOTIS = env.win.NOTIS;
  env.ctx.NAV = NAV;
  load(env, 'swipe-back.js');
  const target = { tagName: 'DIV', closest: () => null, parentElement: null };
  function fire(type, x, y) {
    const touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
    (env.docListeners[type] || []).forEach(f => f({ touches, target, cancelable: true, preventDefault() {} }));
  }
  function swipe(x0, x1, dy = 0) {
    fire('touchstart', x0, 300);
    const steps = 6;
    for (let i = 1; i <= steps; i++) fire('touchmove', x0 + (x1 - x0) * i / steps, 300 + dy * i / steps);
    fire('touchend');
    env.flush();
  }
  return { env, app, NAV, swipe };
}

// Bredd 400 px: minsta drag = max(100, 28 %) = 112 px. Vänstra halvan = 0–200. Notiskant = 376–400.
{
  const { app, NAV, swipe } = setup();
  app.tap('prognos'); app.tap('ankomster');
  swipe(150, 330);                       // start i vänstra halvan (inte vid kanten), höger = bakåt
  assert.equal(app.view, 'prognos');
  swipe(10, 200);                        // från kanten går också
  assert.equal(app.view, '');
  swipe(150, 330);                       // på startskärmen utan något bakåt: inget händer
  assert.equal(app.view, '');
  swipe(300, 100);                       // vänster från mitten = framåt
  assert.equal(app.view, 'prognos');
  swipe(300, 100);
  assert.equal(app.view, 'ankomster');
  swipe(300, 100);                       // inget framåt: inget händer
  assert.equal(app.view, 'ankomster');
  assert.equal(NAV.canForward(), false);
}

// För kort eller för lodrätt drag gör inget ("dra tydligt").
{
  const { app, swipe } = setup();
  app.tap('prognos'); app.tap('ankomster');
  swipe(150, 240);                       // 90 px < 112 px
  assert.equal(app.view, 'ankomster');
  swipe(150, 330, 120);                  // lodrätt 120 >= hälften av 180
  assert.equal(app.view, 'ankomster');
  app.view = 'ankomster';
  swipe(260, 330);                       // höger från högra halvan: ingen bakåt
  assert.equal(app.view, 'ankomster');
}

// Vänster från högra kanten startar aldrig framåt (notispanelen tar den), från mitten gör den det.
{
  const { app, swipe } = setup();
  app.tap('prognos'); app.tap('ankomster');
  swipe(150, 330);
  assert.equal(app.view, 'prognos');
  swipe(390, 150);                       // kantzonen: framåt-swipen rör den inte
  assert.equal(app.view, 'prognos');
  swipe(370, 150);                       // precis innanför kanten: framåt
  assert.equal(app.view, 'ankomster');
}

// Notispanelen öppen: ingen bakåt/framåt-swipe (panelens egna drag gäller).
{
  const { env, app, swipe } = setup();
  app.tap('prognos'); app.tap('ankomster');
  env.win.NOTIS.isOpen = () => true;
  swipe(150, 330);
  assert.equal(app.view, 'ankomster');
}

// notis.js: kantdraget är kvar som förut (24 px, börjar bara vid högra kanten, dra åt vänster öppnar).
{
  const notis = fs.readFileSync(path.join(root, 'TaxiData/notis.js'), 'utf8');
  assert.match(notis, /var EDGE = 24;/);
  assert.match(notis, /t\.clientX >= window\.innerWidth - EDGE && canOpen\(\)/);
  assert.match(notis, /tg\.opening \? dx < -12 : dx > 12/);
  const sb = fs.readFileSync(path.join(root, 'TaxiData/swipe-back.js'), 'utf8');
  assert.match(sb, /var NOTIS_EDGE = 24;/);
}

// Kopplingen i index.html och cache-taggar.
{
  const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
  assert.match(html, /nav-historik\.js\?v=20261112swipe1/);
  assert.match(html, /swipe-back\.js\?v=20261112swipe1/);
  assert.ok(html.indexOf('nav-historik.js') < html.indexOf('swipe-back.js'));
  assert.match(html, /NAV\.handlePop\(ev\.state/);
  assert.doesNotMatch(html, /current === MINA_BEVAKNINGAR\.id\) \{\s*goHome\(\);/);   // inte längre alltid hem
  for (const f of ['admin.html', 'akeridata.html', 'sadmin.html']) {
    assert.match(fs.readFileSync(path.join(root, 'TaxiData', f), 'utf8'), /swipe-back\.js\?v=20261112swipe1/, f);
  }
  const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
  assert.match(lv, /changelog\.js\?v=2026111[23](bot1|mapp1|ljud1|svar2|pgfix1|mod2|lasbar1|skroll1|chatt1|prick2|barn1|sedd1|hem1)/);
  assert.match(html, /lazy-views\.js\?v=2026111[23](swipe1|mapp1|ljud1|svar2|pgfix1|mod2|lasbar1|skroll1|chatt1|prick2|barn1|sedd1|hem1)/);
  const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
  assert.ok(cl.indexOf("2026-11-12swipe1") < cl.indexOf("2026-11-12zon2"));
}

console.log('swipe-historik gesture: ok');
