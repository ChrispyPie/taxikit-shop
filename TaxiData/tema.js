/* Tema, textstorlek och startskärmens rutnät (Inställningar). Laddas blockerande i <head> på alla sidor,
   före stilmallarna, så att rätt färger och rutnät gäller redan vid första målningen (ingen vit blixt).
   localStorage: taxi_theme = 'light' | 'dark' | 'auto' (standard auto = följ telefonen)
                 taxi_text_size = '90' | '100' | '115' | '130' (procent, standard 100)
                 taxi_home_layout = '3' | '4' | '5' | '6' (Startskärm: 3×3, 4×4, 5×5, 6×6; ikonstorleken följer rutnätet;
                   på Delad enhet sparas valet per förar-id i 'taxi_home_layout:<förar-id>'). */
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var THEMES = ['light', 'dark', 'auto'], SIZES = ['90', '100', '115', '130'];
  var LAYOUTS = ['3', '4', '5', '6'];
  var META = { light: '#ffffff', dark: '#0f1720' };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function layoutKey() {
    if (get('taxi_delad_enhet') === '1') {
      var d = get('taxi_driver');
      if (d) return 'taxi_home_layout:' + d;
    }
    return 'taxi_home_layout';
  }
  function normLayout(v) {
    if (LAYOUTS.indexOf(v) >= 0) return v;
    if (v === '2') return '3';
    return '4';
  }
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
  function getLayout() { return normLayout(get(layoutKey())); }
  function applyLayout() {
    root.setAttribute('data-home', getLayout());
    root.removeAttribute('data-icons');
  }
  function applyAll() { applyTheme(); applySize(); applyLayout(); }
  applyAll();
  if (mq) {
    var onChange = function () { if (getTheme() === 'auto') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === 'taxi_theme' || e.key === 'taxi_text_size' || e.key.indexOf('taxi_home_layout') === 0 || e.key === 'taxi_delad_enhet' || e.key === 'taxi_driver') applyAll();
  });
  document.addEventListener('DOMContentLoaded', applyTheme);
  window.TEMA = {
    getTheme: getTheme, getSize: getSize, resolved: resolved,
    getLayout: getLayout,
    setTheme: function (v) { if (THEMES.indexOf(v) < 0) return; put('taxi_theme', v); applyTheme(); },
    setSize: function (v) { v = String(v); if (SIZES.indexOf(v) < 0) return; put('taxi_text_size', v); applySize(); },
    setLayout: function (v) {
      v = String(v);
      if (LAYOUTS.indexOf(v) < 0) return;
      put(layoutKey(), v);
      applyLayout();
    },
    applyLayout: applyLayout,
    applyAll: applyAll
  };
})();
