/* Animationer i appen: ett tunt överlager som kan visa korta figurer
 * utan att blockera tryck. Först ut: när en bevakning slår till (samma
 * ögonblick som tåg-/flyg-/båtljudet) flyger en figur över skärmen.
 * Inställningen 'Animationer' (localStorage 'taxi_animationer', på som
 * standard) är fristående från ljudet (taxi_bev_ljud). Fler animationer
 * (t.ex. väder) kan återanvända samma lager senare.
 * Ångra: ta bort den här filen, script-taggen och rutan i Inställningar,
 * och anropet i bevakning-ljud.js (bev-watch-fire). */
(function () {
  'use strict';
  var KEY = 'taxi_animationer';
  var DURATION_MS = 2400;
  var REDUCED_MS = 900;
  var MAX_ON_SCREEN = 2;

  function read() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || ''); } catch (e) { o = {}; }
    if (!o || typeof o !== 'object') o = {};
    return { on: o.on !== false };
  }
  function write(s) {
    try { localStorage.setItem(KEY, JSON.stringify({ on: !!(s && s.on) })); } catch (e) {}
  }
  function isOn() { return read().on !== false; }
  function setOn(on) { write({ on: !!on }); try { document.dispatchEvent(new CustomEvent('animationer-change')); } catch (e) {} }

  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  // Enkla silhuetter, synliga på ljust och mörkt. Inte emoji.
  var ICONS = {
    flyg: '<svg viewBox="0 0 64 32" width="100%" height="100%" aria-hidden="true"><path fill="currentColor" d="M62 17c-1.2 0-8.5-1.1-13.2-1.8L36.4 4.2c-.4-.5-1-.8-1.6-.8h-3.1l7.4 11.1H22.6L16 9.4c-.3-.4-.8-.6-1.3-.6h-2.7l4.2 8.3H4.2C2.4 17.1 1 16 1 16s1.2 1.4 2.6 2.1l13.6.9-4.4 7.2c-.2.4 0 .9.5 1.1.2.1.4.1.6.1h2.6c.5 0 1-.3 1.3-.7l5.2-8H40l-6.6 11h3.2c.7 0 1.3-.3 1.7-.8l10.8-13.2c5.2.7 12 1.8 13 1.8 1.2 0 2-.5 2-1.2s-.9-1.2-2.1-1.2z"/></svg>',
    tag: '<svg viewBox="0 0 72 28" width="100%" height="100%" aria-hidden="true"><path fill="currentColor" d="M4 6.5c0-1.4 1.1-2.5 2.5-2.5H42c.8 0 1.5.4 1.9 1.1L50 12h12.5c2 0 3.5 1.4 3.5 3.2V20H4V6.5z"/><rect x="8" y="8" width="8" height="6" rx="1" fill="#fff" fill-opacity=".35"/><rect x="19" y="8" width="8" height="6" rx="1" fill="#fff" fill-opacity=".35"/><rect x="30" y="8" width="8" height="6" rx="1" fill="#fff" fill-opacity=".35"/><circle cx="14" cy="22.5" r="3.2" fill="currentColor"/><circle cx="14" cy="22.5" r="1.2" fill="#fff" fill-opacity=".5"/><circle cx="28" cy="22.5" r="3.2" fill="currentColor"/><circle cx="28" cy="22.5" r="1.2" fill="#fff" fill-opacity=".5"/><circle cx="54" cy="22.5" r="3.2" fill="currentColor"/><circle cx="54" cy="22.5" r="1.2" fill="#fff" fill-opacity=".5"/><path fill="currentColor" d="M50 12l6.2-7.2c.3-.4.8-.6 1.3-.6H62v8H50z"/></svg>',
    bat: '<svg viewBox="0 0 72 28" width="100%" height="100%" aria-hidden="true"><path fill="currentColor" d="M8 18.5l6-8.5h8l3-4h4l2 4h22c2.2 0 5 1.2 6.5 3.2L62 16H66l-3 4.5c-1 1.6-2.8 2.5-4.7 2.5H12.5C9 23 6.5 20.8 8 18.5z"/><rect x="18" y="9.5" width="5" height="4" rx=".8" fill="#fff" fill-opacity=".35"/><rect x="26" y="9.5" width="5" height="4" rx=".8" fill="#fff" fill-opacity=".35"/><rect x="34" y="9.5" width="5" height="4" rx=".8" fill="#fff" fill-opacity=".35"/><path fill="currentColor" d="M39 4h2.4v6H39z"/><circle cx="40.2" cy="3.2" r="1.5" fill="currentColor"/></svg>'
  };

  var layer = null;
  function ensureStyle() {
    if (document.getElementById('animationer-style')) return;
    var css = document.createElement('style');
    css.id = 'animationer-style';
    css.textContent =
      '#animationer-layer{position:fixed;inset:0;z-index:240;pointer-events:none!important;overflow:hidden}' +
      '#animationer-layer *{pointer-events:none!important}' +
      '.anim-actor{position:absolute;left:0;top:0;width:clamp(48px,9vw,84px);height:auto;color:#2b6cb0;filter:drop-shadow(0 2px 5px rgba(0,0,0,.28));will-change:transform,opacity;opacity:0}' +
      'html[data-theme="dark"] .anim-actor{color:#90cdf4;filter:drop-shadow(0 2px 6px rgba(0,0,0,.45))}' +
      '.anim-actor svg{display:block;overflow:visible}' +
      '.anim-flyg{top:12%;animation:anim-flyg 2.4s cubic-bezier(.2,.7,.2,1) forwards}' +
      '.anim-tag{top:auto;bottom:calc(16% + env(safe-area-inset-bottom,0px));animation:anim-tag 2.4s cubic-bezier(.25,.7,.2,1) forwards}' +
      '.anim-bat{top:auto;bottom:calc(12% + env(safe-area-inset-bottom,0px));animation:anim-bat 2.6s cubic-bezier(.25,.7,.2,1) forwards}' +
      '@keyframes anim-flyg{0%{transform:translate3d(-22vw,0,0) rotate(-10deg);opacity:0}10%{opacity:.95}82%{opacity:.95}100%{transform:translate3d(118vw,14vh,0) rotate(6deg);opacity:0}}' +
      '@keyframes anim-tag{0%{transform:translate3d(-24vw,0,0);opacity:0}10%{opacity:.95}20%{transform:translate3d(8vw,0,0)}22%{transform:translate3d(12vw,-2px,0)}40%{transform:translate3d(40vw,0,0)}42%{transform:translate3d(44vw,-2px,0)}70%{transform:translate3d(82vw,0,0)}82%{opacity:.95}100%{transform:translate3d(118vw,0,0);opacity:0}}' +
      '@keyframes anim-bat{0%{transform:translate3d(-24vw,0,0);opacity:0}10%{opacity:.95}25%{transform:translate3d(18vw,-4px,0)}50%{transform:translate3d(50vw,3px,0)}75%{transform:translate3d(84vw,-3px,0)}82%{opacity:.95}100%{transform:translate3d(118vw,0,0);opacity:0}}' +
      '.anim-actor.anim-reduced{animation:anim-reduced .9s ease forwards!important;left:50%;top:18%;bottom:auto;margin-left:-32px}' +
      '.anim-tag.anim-reduced,.anim-bat.anim-reduced{top:auto;bottom:calc(18% + env(safe-area-inset-bottom,0px))}' +
      '@keyframes anim-reduced{0%{transform:scale(.85);opacity:0}25%{transform:scale(1);opacity:.95}75%{transform:scale(1);opacity:.95}100%{transform:scale(.95);opacity:0}}' +
      '@media (min-width:900px){.anim-actor{width:clamp(64px,8vw,96px)}}' +
      '.anim-try{min-height:32px;padding:4px 12px;border-radius:8px;border:1px solid var(--border,#cbd5e0);background:var(--surface,#fff);color:inherit;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}';
    document.head.appendChild(css);
  }

  function ensureLayer() {
    ensureStyle();
    if (layer && layer.isConnected) return layer;
    layer = document.getElementById('animationer-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'animationer-layer';
      layer.setAttribute('aria-hidden', 'true');
    }
    if (document.body && !layer.isConnected) document.body.appendChild(layer);
    return layer;
  }

  function prune(host) {
    if (!host) return;
    var kids = host.children;
    while (kids.length >= MAX_ON_SCREEN) host.removeChild(kids[0]);
  }

  function play(kind, opts) {
    opts = opts || {};
    if (!isOn() && !opts.force) return null;
    if (kind !== 'tag' && kind !== 'flyg' && kind !== 'bat') return null;
    var host = ensureLayer();
    if (!host) return null;
    prune(host);
    var reduced = !opts.freezeAt && (opts.reduced != null ? !!opts.reduced : reduceMotion());
    var el = document.createElement('div');
    el.className = 'anim-actor anim-' + kind + (reduced ? ' anim-reduced' : '');
    el.setAttribute('data-anim-kind', kind);
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = ICONS[kind] || '';
    var ms = reduced ? REDUCED_MS : (kind === 'bat' ? 2600 : DURATION_MS);
    if (opts.freezeAt != null) {
      var at = Math.max(0, Math.min(0.95, Number(opts.freezeAt) || 0));
      el.style.animationDelay = (-at * (ms / 1000)) + 's';
      el.style.animationPlayState = 'paused';
    } else {
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms + 80);
    }
    host.appendChild(el);
    return el;
  }

  function playFromEvent(e) {
    var kind = e && e.detail && e.detail.kind;
    if (kind) play(kind);
  }

  function renderSettings(box) {
    if (!box) return;
    ensureStyle();
    var on = isOn();
    box.innerHTML = '<div class="section"><h3 style="margin-top:0">Animationer</h3>' +
      '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">' +
      'När en bevakning slår till flyger en kort figur över skärmen: flygplan, tåg eller båt. När det regnar eller snöar kan några droppar eller flingor synas. Påverkar inte ljudet.</p>' +
      '<div class="hl-opts" role="radiogroup" aria-label="Animationer">' +
        '<label class="hl-opt' + (!on ? ' on' : '') + '"><input type="radio" name="animationer" value="0"' + (!on ? ' checked' : '') + '><span>Av</span></label>' +
        '<label class="hl-opt' + (on ? ' on' : '') + '"><input type="radio" name="animationer" value="1"' + (on ? ' checked' : '') + '><span>På</span></label>' +
      '</div>' +
      '<p style="margin:.55rem 0 0"><button type="button" class="anim-try" data-anim-try="flyg">Prova</button></p>' +
      '</div>';
    box.onchange = function (e) {
      if (!e.target || e.target.name !== 'animationer') return;
      setOn(e.target.value === '1');
      renderSettings(box);
    };
    box.onclick = function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-anim-try]');
      if (!b) return;
      e.preventDefault();
      play(b.getAttribute('data-anim-try') || 'flyg', { force: true });
    };
  }

  if (document.addEventListener) {
    document.addEventListener('bev-watch-fire', playFromEvent);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureLayer);
    else if (document.body) ensureLayer();
  }
  if (window.addEventListener) {
    window.addEventListener('storage', function (e) { if (e && e.key === KEY) { try { document.dispatchEvent(new CustomEvent('animationer-change')); } catch (err) {} } });
  }

  window.ANIMATIONER = {
    isOn: isOn,
    setOn: setOn,
    read: read,
    play: play,
    renderSettings: renderSettings,
    reduceMotion: reduceMotion,
    layer: ensureLayer,
    key: KEY,
    durationMs: DURATION_MS
  };
})();
