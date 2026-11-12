// Sidhistoriken (nav-historik.js): bakåt ett steg i taget, framåt, ny sida rensar framåt.
const assert = require('node:assert/strict');
const { makeEnv, makeApp } = require('./harness.cjs');

// Hem -> Prognos -> Ankomster: bakåt till Prognos, bakåt till Hem, bakåt på Hem gör inget.
{
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  assert.equal(NAV.cur(), 0);
  assert.equal(NAV.here(), '');
  app.tap('prognos'); app.tap('ankomster');
  assert.equal(NAV.cur(), 2);
  assert.equal(NAV.canForward(), false);
  app.back(); assert.equal(app.view, 'prognos');
  app.back(); assert.equal(app.view, '');
  assert.equal(NAV.canBack(), false);
  assert.equal(app.back(), false);          // på startskärmen: inget fel, inget händer
  assert.equal(app.view, '');
  assert.equal(env.hist.i, 0);
}

// Hem -> Prognos -> Ankomster, bakåt till Prognos, framåt till Ankomster.
{
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  app.tap('prognos'); app.tap('ankomster');
  app.back();
  assert.equal(app.view, 'prognos');
  assert.equal(NAV.canForward(), true);
  assert.equal(app.forward(), true);
  assert.equal(app.view, 'ankomster');
  assert.equal(NAV.canForward(), false);
  assert.equal(app.forward(), false);
  // två bakåt, två framåt
  app.back(); app.back(); assert.equal(app.view, '');
  app.forward(); assert.equal(app.view, 'prognos');
  app.forward(); assert.equal(app.view, 'ankomster');
}

// Hem -> Prognos -> Ankomster, bakåt till Prognos, tryck Inställningar: framåt är borta.
{
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  app.tap('prognos'); app.tap('ankomster');
  app.back();
  app.tap('installningar');
  assert.equal(NAV.canForward(), false);
  assert.equal(app.forward(), false);
  assert.equal(app.view, 'installningar');
  app.back(); assert.equal(app.view, 'prognos');
  app.back(); assert.equal(app.view, '');
}

// Samma sida igen ger inget nytt steg; 🏠 är ett vanligt steg.
{
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  app.tap('prognos'); app.tap('prognos');
  assert.equal(NAV.cur(), 1);
  app.home(); app.tap('vader');
  app.back(); assert.equal(app.view, '');
  app.back(); assert.equal(app.view, 'prognos');
  app.back(); assert.equal(app.view, '');
}

// Under-vy (forumtråd): bakåt stänger tråden först, sedan föregående sida. Framåt hoppar över tråden.
{
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  app.tap('forum'); app.openSub('thread');
  app.back();
  assert.equal(app.subBackCalls, 1);
  assert.equal(app.view, 'forum');
  app.back(); assert.equal(app.view, '');
  app.forward(); assert.equal(app.view, 'forum');
  assert.equal(NAV.canForward(), false);    // tråden går inte att öppna igen av sig själv
}

// Bil & verkstad: öppen anmälan utan eget steg. Bakåt stänger den och sidan ligger kvar i historiken.
{
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  app.tap('prognos'); app.tap('verkstad');
  app.sub.verkstad = 'edit';             // ingen pushState, som verkstad.js
  app.back();
  assert.equal(app.view, 'verkstad');
  assert.equal(NAV.here(), 'verkstad');
  app.back(); assert.equal(app.view, 'prognos');
}

// Notispanelen: öppna och stäng lämnar ett gammalt steg, det hoppas över åt båda håll.
{
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  app.tap('prognos'); app.tap('ankomster');
  app.back();                               // Prognos, framåt = Ankomster
  app.openNotis();                          // nytt steg: framåt rensas (som i webbläsaren)
  app.closeNotis(); env.flush();
  assert.equal(app.view, 'prognos');
  assert.equal(NAV.canForward(), false);    // stängd notispanel räknas inte som en sida framåt
  app.back(); assert.equal(app.view, '');
  // Bakåt med panelen öppen stänger bara panelen.
  app.tap('vader'); app.openNotis();
  app.back();
  assert.equal(app.notisOpen, false);
  assert.equal(app.view, 'vader');
}

// Omladdning i samma flik: listan och läget finns kvar (sessionStorage + __idx i state).
{
  const env = makeEnv();
  const { app } = makeApp(env);
  app.tap('prognos'); app.tap('ankomster'); app.back();
  const saved = env.ss.taxi_nav_v1;
  const env2 = makeEnv({ initialState: env.hist.state });
  env2.ss.taxi_nav_v1 = saved;
  const r = makeApp(env2);
  r.app.view = 'prognos';
  assert.equal(r.NAV.cur(), 1);
  assert.equal(r.NAV.here(), 'prognos');
  assert.equal(r.NAV.canForward(), true);
  assert.equal(r.NAV.push('prognos'), false);   // showMenu lägger inte ett extra steg vid omladdning
}

// #-länk (nytt steg utan __idx) gör inget och kastar inte.
{
  const env = makeEnv();
  const { app, NAV } = makeApp(env);
  app.tap('om');
  env.hist.entries.push({ state: null }); env.hist.i++;
  env.listeners.popstate.forEach(f => f({ state: null }));
  assert.equal(app.view, 'om');
  assert.equal(NAV.cur(), 2);
  app.back(); assert.equal(app.view, '');      // steget för samma sida hoppas över: ett bakåt räcker
}

console.log('swipe-historik stack: ok');
