/* Tema, textstorlek och ikonstorlek (Inställningar). Laddas blockerande i <head> på alla sidor,
   före stilmallarna, så att rätt färger och rutnät gäller redan vid första målningen (ingen vit blixt).
   localStorage: taxi_theme = 'light' | 'dark' | 'auto' (standard auto = följ telefonen)
                 taxi_text_size = '90' | '100' | '115' | '130' (procent, standard 100)
                 taxi_icon_size = '1' | '2' | '3' | '4' | '5' (Ikonstorlek, 1 = liten … 5 = störst;
                   standard 3 ger ungefär tidigare 4×4 på en telefon; kolumner räknas från skärmbredd och storlek.
                   Äldre taxi_home_layout 3|4|5|6 flyttas till närmaste steg.
                   På Delad enhet sparas valet per förar-id i 'taxi_icon_size:<förar-id>'). */
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var THEMES = ['light', 'dark', 'auto'], SIZES = ['90', '100', '115', '130'];
  var ICON_SIZES = ['1', '2', '3', '4', '5'];
  var META = { light: '#ffffff', dark: '#0f1720' };
  // Tidigare rutnätsval (3×3…6×6) → närmaste ikonstorlekssteg.
  var FROM_LAYOUT = { '6': '1', '5': '2', '4': '3', '3': '4', '2': '4' };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isDelad() { return get('taxi_delad_enhet') === '1'; }
  function driverId() { return get('taxi_driver') || ''; }
  function scoped(base) {
    if (isDelad()) {
      var d = driverId();
      if (d) return base + ':' + d;
    }
    return base;
  }
  function iconSizeKey() { return scoped('taxi_icon_size'); }
  function layoutKey() { return scoped('taxi_home_layout'); }
  function migrateFromLayout(v) { return FROM_LAYOUT[v] || '3'; }
  function normIconSize(v) {
    v = v == null ? '' : String(v);
    if (ICON_SIZES.indexOf(v) >= 0) return v;
    if (FROM_LAYOUT[v]) return FROM_LAYOUT[v];
    return '3';
  }
  function readIconSize() {
    var key = iconSizeKey(), raw = get(key);
    if (ICON_SIZES.indexOf(raw) >= 0) return raw;
    var migrated = migrateFromLayout(get(layoutKey()));
    put(key, migrated);
    return migrated;
  }
  function getTheme() { var v = get('taxi_theme'); return THEMES.indexOf(v) >= 0 ? v : 'auto'; }
  function getSize() { var v = get('taxi_text_size'); return SIZES.indexOf(v) >= 0 ? v : '100'; }
  function getIconSize() { return readIconSize(); }
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
    var v = getIconSize();
    root.setAttribute('data-icon-size', v);
    root.removeAttribute('data-home');
    root.removeAttribute('data-icons');
  }
  function applyAll() { applyTheme(); applySize(); applyLayout(); }
  applyAll();
  if (mq) {
    var onChange = function () { if (getTheme() === 'auto') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === 'taxi_theme' || e.key === 'taxi_text_size' ||
        e.key.indexOf('taxi_icon_size') === 0 || e.key.indexOf('taxi_home_layout') === 0 ||
        e.key === 'taxi_delad_enhet' || e.key === 'taxi_driver') applyAll();
  });
  document.addEventListener('DOMContentLoaded', applyTheme);
  window.TEMA = {
    getTheme: getTheme, getSize: getSize, resolved: resolved,
    getIconSize: getIconSize,
    getLayout: getIconSize,
    setTheme: function (v) { if (THEMES.indexOf(v) < 0) return; put('taxi_theme', v); applyTheme(); },
    setSize: function (v) { v = String(v); if (SIZES.indexOf(v) < 0) return; put('taxi_text_size', v); applySize(); },
    setIconSize: function (v) {
      v = normIconSize(v);
      put(iconSizeKey(), v);
      applyLayout();
    },
    setLayout: function (v) { window.TEMA.setIconSize(v); },
    applyLayout: applyLayout,
    applyAll: applyAll
  };
})();
