/* Sidhistorik i appen (2026-11-12swipe1): en stack som delas av bakåt-swipen, framåt-swipen och
 * telefonens/webbläsarens bakåtknapp. Bygger på webbläsarens History API: varje steg som appen lägger
 * med history.pushState får ett löpnummer (__idx) i state, och en kort lista (vy + typ) sparas i
 * sessionStorage så att vi vet vad som finns bakåt och framåt. Inga texter, namn eller data sparas,
 * bara vy-id ('' = startskärmen).
 *   typ 'page'  = en sida (Prognos, Ankomster, Inställningar, startskärmen …)
 *   typ 'sub'   = en under-vy som modulen själv lade (forumtråd, profilens redigera, inkorgstråd)
 *   typ 'notis' = notispanelen
 * Bakåt = history.back(). Framåt = history.go(n) till nästa riktiga sida (hoppar över under-vyer och
 * notispanelen, som inte går att öppna igen av sig själva). Ny sida (tryck) tar bort allt framåt, som i
 * en webbläsare. index.html:s popstate anropar NAV.handlePop.
 * Ångra: se docs/swipe-historik/UNDO.md. */
(function (win) {
  'use strict';
  var KEY = 'taxi_nav_v1';
  var H = win.history;
  if (!H || win.NAV) return;
  var origPush = H.pushState, origReplace = H.replaceState;
  var st = { cur: 0, list: [] };

  function store() { try { return win.sessionStorage || null; } catch (e) { return null; } }
  function load() {
    var s = store(); if (!s) return;
    try {
      var o = JSON.parse(s.getItem(KEY) || 'null');
      if (o && Array.isArray(o.list) && typeof o.cur === 'number') { st.list = o.list; st.cur = o.cur; }
    } catch (e) {}
  }
  function save() { var s = store(); if (!s) return; try { s.setItem(KEY, JSON.stringify({ cur: st.cur, list: st.list })); } catch (e) {} }
  function viewNow() { try { return typeof win.NAV_VIEW === 'function' ? String(win.NAV_VIEW() || '') : ''; } catch (e) { return ''; } }
  function isObj(s) { return s === null || s === undefined || (typeof s === 'object' && !Array.isArray(s)); }
  function stamp(state, idx) {
    var out = {}, k;
    if (state && typeof state === 'object') for (k in state) if (Object.prototype.hasOwnProperty.call(state, k)) out[k] = state[k];
    out.__idx = idx;
    return out;
  }
  function summarize(state) {
    if (state && state.notis) return { v: viewNow(), k: 'notis' };
    if (state && Object.prototype.hasOwnProperty.call(state, 'view')) {
      var v = state.view == null ? '' : String(state.view);
      if (v === 'hem') v = '';
      return { v: v, k: state.sub ? 'sub' : 'page' };
    }
    return { v: viewNow(), k: 'page' };
  }
  function callOrig(fn, state, args) {
    var a = [state, args.length > 1 ? args[1] : ''];
    if (args.length > 2 && args[2] !== undefined) a.push(args[2]);
    return fn.apply(H, a);
  }

  H.pushState = function (state) {
    if (!isObj(state)) return callOrig(origPush, state, arguments);
    var idx = st.cur + 1;
    var r = callOrig(origPush, stamp(state, idx), arguments);
    st.list.length = idx;            // ny sida: allt framåt försvinner (som i en webbläsare)
    st.list[idx] = summarize(state);
    st.cur = idx; save();
    return r;
  };
  H.replaceState = function (state) {
    if (!isObj(state)) return callOrig(origReplace, state, arguments);
    var r = callOrig(origReplace, stamp(state, st.cur), arguments);
    st.list[st.cur] = summarize(state);
    save();
    return r;
  };

  // Start: samma flik (omladdning) behåller listan; ny start börjar om med startskärmen som steg 0.
  load();
  (function install() {
    var s = H.state;
    if (s && typeof s.__idx === 'number' && s.__idx >= 0) {
      st.cur = s.__idx;
      if (!st.list[st.cur]) st.list[st.cur] = summarize(s);
    } else {
      st.list = []; st.cur = 0;
      var base = s && typeof s === 'object' ? s : { view: null };
      if (!Object.prototype.hasOwnProperty.call(base, 'view') && !base.notis) { base = stamp(base, 0); base.view = null; }
      try { origReplace.call(H, stamp(base, 0), ''); } catch (e) {}
      st.list[0] = summarize(base);
    }
    save();
  })();
  // Lämnar sidan (t.ex. till admin.html): framåt-steg utanför den här sidan går inte att nå med swipe.
  if (win.addEventListener) {
    win.addEventListener('pagehide', function () { st.list.length = st.cur + 1; save(); });
    win.addEventListener('pageshow', function (e) { if (e && e.persisted) save(); });
  }

  function entry(i) { return st.list[i] || null; }
  function forwardTarget() {
    var now = viewNow();
    for (var j = st.cur + 1; j < st.list.length; j++) {
      var e = st.list[j];
      if (e && e.k === 'page' && e.v !== now) return j;
    }
    return -1;
  }

  var N = win.NAV = {};
  N.cur = function () { return st.cur; };
  N.here = function () { var e = entry(st.cur); return e ? e.v : ''; };
  N.entries = function () { return st.list.map(function (e) { return e ? { v: e.v, k: e.k } : null; }); };
  N.canBack = function () { return st.cur > 0; };
  N.canForward = function () { return forwardTarget() >= 0; };
  N.back = function () { if (st.cur <= 0) return false; try { H.back(); return true; } catch (e) { return false; } };
  N.forward = function () {
    var j = forwardTarget(); if (j < 0) return false;
    try { H.go(j - st.cur); return true; } catch (e) { return false; }
  };
  // Lägg till ett steg för vyn om det inte redan är det aktuella (samma sida igen = inget nytt steg).
  N.push = function (v, replace) {
    v = v == null ? '' : String(v);
    var e = entry(st.cur);
    if (e && e.k !== 'notis' && e.v === v && !replace) return false;
    try { (replace ? H.replaceState : H.pushState).call(H, { view: v || null }, ''); return true; } catch (er) { return false; }
  };
  // Uppdatera löpnumret vid popstate. dir: -1 bakåt, 1 framåt, 0 = nytt steg (t.ex. #-länk) eller okänt.
  N.pop = function (state) {
    if (state && typeof state.__idx === 'number') {
      var to = state.__idx, dir = to < st.cur ? -1 : to > st.cur ? 1 : 0;
      st.cur = to;
      if (!st.list[to]) st.list[to] = summarize(state);
      save();
      return { dir: dir, idx: to, entry: st.list[to] };
    }
    var idx = st.cur + 1;
    st.list.length = idx; st.list[idx] = summarize(state); st.cur = idx;
    try { origReplace.call(H, stamp(state, idx), ''); } catch (e) {}
    save();
    return { dir: 0, idx: idx, entry: st.list[idx] };
  };
  /* Hela popstate-logiken (index.html). hooks:
   *   notis()      true = steget hörde till notispanelen (NOTIS.onPop)
   *   locked()     true = profil-/lösenordsspärr tog hand om steget
   *   subBack()    true = modulen gick ett steg tillbaka inom sig själv (tråd -> lista m.m.)
   *   here()       vyn som visas nu ('' = startskärmen)
   *   show(v)      visa vyn utan att lägga nytt steg
   * Returnerar vad som hände (för test): 'notis' | 'new' | 'locked' | 'sub' | 'skip' | 'show' | 'none'. */
  N.handlePop = function (state, hooks) {
    var p = N.pop(state);
    if (hooks.notis && hooks.notis()) return 'notis';
    if (p.dir === 0) return 'new';
    if (hooks.locked && hooks.locked()) return 'locked';
    var here = String(hooks.here() || '');
    if (p.dir < 0 && hooks.subBack && hooks.subBack()) {
      // Modulen stängde något som inte hade eget steg (t.ex. Bil & verkstad): lägg tillbaka sidans steg.
      if (N.here() !== here) N.push(here);
      return 'sub';
    }
    var e = p.entry || { v: '', k: 'page' };
    if (e.k === 'notis' || e.v === here) {
      // Inget att visa här (stängd notispanel eller samma sida): fortsätt åt samma håll.
      if (p.dir < 0) N.back(); else N.forward();
      return 'skip';
    }
    hooks.show(e.v);
    return 'show';
  };
})(window);
