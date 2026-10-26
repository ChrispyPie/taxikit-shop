/* Tema och textstorlek (Inställningar → Tema / Textstorlek). Laddas blockerande i <head> på alla sidor,
   före stilmallarna, så att rätt färger och storlek gäller redan vid första målningen (ingen vit blixt).
   localStorage: taxi_theme = 'light' | 'dark' | 'auto' (standard auto = följ telefonen)
                 taxi_text_size = '90' | '100' | '115' | '130' (procent, standard 100)
                 taxi_home_layout = '2' | '3' | 'lista' (Startskärm, gäller även adminmenyn) */
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var THEMES = ['light', 'dark', 'auto'], SIZES = ['90', '100', '115', '130'], LAYOUTS = ['2', '3', 'lista'];
  var META = { light: '#ffffff', dark: '#0f1720' };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getTheme() { var v = get('taxi_theme'); return THEMES.indexOf(v) >= 0 ? v : 'auto'; }
  function getSize() { var v = get('taxi_text_size'); return SIZES.indexOf(v) >= 0 ? v : '100'; }
  function resolved() { var t = getTheme(); return t === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : t; }
  function setMeta(c) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; (document.head || root).appendChild(m); }
    m.setAttribute('content', c);
  }
  function applyTheme() {
    var r = resolved();
    root.setAttribute('data-theme', r);
    root.style.colorScheme = r;
    setMeta(META[r]);
  }
  function applySize() { root.style.setProperty('--font-scale', String(parseInt(getSize(), 10) / 100)); }
  function applyLayout() {
    var v = get('taxi_home_layout');
    if (LAYOUTS.indexOf(v) >= 0) root.setAttribute('data-home', v); else root.removeAttribute('data-home');
  }
  function applyAll() { applyTheme(); applySize(); applyLayout(); }
  applyAll();
  if (mq) {
    var onChange = function () { if (getTheme() === 'auto') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  // Ändring i en annan flik (t.ex. admin öppen samtidigt) slår igenom direkt.
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === 'taxi_theme' || e.key === 'taxi_text_size' || e.key === 'taxi_home_layout') applyAll();
  });
  // meta theme-color kan stå senare i <head> än detta skript: sätt om när sidan är tolkad.
  document.addEventListener('DOMContentLoaded', applyTheme);
  window.TEMA = {
    getTheme: getTheme, getSize: getSize, resolved: resolved,
    setTheme: function (v) { if (THEMES.indexOf(v) < 0) return; put('taxi_theme', v); applyTheme(); },
    setSize: function (v) { v = String(v); if (SIZES.indexOf(v) < 0) return; put('taxi_text_size', v); applySize(); },
    applyLayout: applyLayout
  };
})();
