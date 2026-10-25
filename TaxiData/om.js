/* Om appen: vad appen är, vem som bygger den, hur man rapporterar fel, versionsnummer och vanliga frågor.
 * All text finns i om-data.js (window.OM_DATA) så att den är lätt att ändra.
 */
(function () {
  'use strict';
  var O = window.OM = { id: 'om', title: 'Om appen', icon: 'ℹ️' };
  var CSS = '/* Om appen (om.js) */\n' +
    '.om-feat { display: flex; gap: 8px; padding: .25rem 0; font-size: .93rem; } .om-feat b { color: var(--primary); }\n' +
    '.om-faq details { border-top: 1px solid var(--border-soft, #e2e8f0); padding: .55rem 0; }\n' +
    '.om-faq details:first-of-type { border-top: none; }\n' +
    '.om-faq summary { cursor: pointer; font-weight: 600; color: var(--primary); }\n' +
    '.om-faq p { margin: .35rem 0 0; white-space: pre-wrap; font-size: .93rem; color: var(--text); }\n' +
    '.om-ver { text-align: center; color: var(--text-soft); font-size: .85rem; margin: .4rem 0 1rem; }';
  (function () { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); })();
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  O.render = function (content) {
    var d = window.OM_DATA || { faq: [], features: [] };
    var h = '<div class="vk-card"><div class="fo-title" style="font-weight:700;color:var(--primary);font-size:1.1rem;margin-bottom:.3rem">TaxiData</div>' +
      '<p style="margin:0 0 .5rem">' + esc(d.intro) + '</p>';
    (d.features || []).forEach(function (f) { h += '<div class="om-feat"><span>' + esc(f[0]) + '</span><span><b>' + esc(f[1]) + '</b> – ' + esc(f[2]) + '</span></div>'; });
    h += '</div><div class="vk-card"><p style="margin:0 0 .5rem">' + esc(d.builder) + '</p><p style="margin:0 0 .6rem">' + esc(d.report) + '</p>' +
      (window.FORUM ? '<div class="vk-iact"><button data-om="forum">💬 Gå till Forum</button></div>' : '') + '</div>' +
      '<div class="vk-card om-faq"><div class="vk-lbl">Vanliga frågor</div>';
    (d.faq || []).forEach(function (x) { h += '<details><summary>' + esc(x.q) + '</summary><p>' + esc(x.a) + '</p></details>'; });
    h += '</div><div class="om-ver">Version ' + esc(d.version) + '</div>';
    content.innerHTML = h;
    content.onclick = function (e) {
      var b = e.target.closest('[data-om="forum"]');
      if (b && typeof window.openItem === 'function') window.openItem(window.FORUM.id);
    };
  };
})();
