/* Taxikit module registry + small live patches I can push. */
window.TAXIKIT_BUILD = "1.1.0-wip67";
window.TAXIKIT_MODULES = [
  { id: "skift", label: "SKIFT", enabled: true },
  { id: "flode", label: "FLÖDE", enabled: true },
  { id: "trafik", label: "TRAFIK", enabled: true }
];

(function loadChangelog() {
  var s = document.createElement("script");
  s.src = "js/changelog.js?v=" + Date.now();
  s.onload = function () {
    window.TAXIKIT_BUILD = "1.1.0-wip67";
    var build = window.TAXIKIT_BUILD || "";
    var verEl = document.querySelector(".about-version");
    if (verEl && build) verEl.textContent = "Version " + build;
    var list = document.querySelector(".changelog-list");
    var log = window.TAXIKIT_CHANGELOG || [];
    if (!list || !log.length) return;
    list.innerHTML = log.map(function (e, i) {
      var items = (e.items || []).map(function (t) { return "<li>" + t + "</li>"; }).join("");
      return '<li class="changelog-item' + (i === 0 ? " current" : "") + '">' +
        '<div class="changelog-ver">' + e.ver + "</div>" +
        '<div class="changelog-date">' + e.date + "</div>" +
        "<ul>" + items + "</ul></li>";
    }).join("");
  };
  document.head.appendChild(s);
})();

(function dirToggle() {
  if (window.__taxikitDirToggle) return;
  window.__taxikitDirToggle = true;
  document.addEventListener("click", function (ev) {
    var box = ev.target.closest && ev.target.closest("#dirMini");
    if (!box) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    var cur = "ank";
    try { if (localStorage.getItem("taxikit-dir") === "avg") cur = "avg"; } catch (e) {}
    var next = cur === "avg" ? "ank" : "avg";
    try { localStorage.setItem("taxikit-dir", next); } catch (e) {}
    var a = document.getElementById("dirAnk");
    var g = document.getElementById("dirAvg");
    if (a) a.classList.toggle("on", next === "ank");
    if (g) g.classList.toggle("on", next === "avg");
    var rows = document.querySelectorAll("#flodeList .feed-item");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var hasAnk = !!row.querySelector(".feed-chip.ank");
      var hasAvg = !!row.querySelector(".feed-chip.avg");
      var hide = (next === "ank" && hasAvg) || (next === "avg" && hasAnk);
      if (hide) row.classList.add("dir-hide");
      else row.classList.remove("dir-hide");
    }
  }, true);
})();

(function patchRutt() {
  var css = document.createElement("style");
  css.setAttribute("data-taxikit", "rutt-50");
  css.textContent =
    ".rutt-stop{padding:0!important;min-height:32px!important}" +
    ".rutt-line{align-self:stretch!important;min-height:32px!important}" +
    ".rutt-rail{top:13px!important;bottom:-13px!important}" +
    ".rutt-dot{top:8px!important}" +
    ".rutt-n{min-height:auto!important;padding:6px 0 10px!important}" +
    ".rutt-track{display:none}" +
    ".rutt-n.is-home .rutt-track{display:block}" +
    ".feed-item .feed-city{color:var(--fg);font-weight:800;font-size:0.95rem}" +
    ".feed-item .feed-idline{color:var(--muted);font-weight:650;font-size:0.78rem;margin-top:2px}" +
    ".feed-item .feed-event{color:var(--muted);font-weight:600}" +
    ".feed-item .feed-chips .feed-id{display:none}" +
    ".dir-mini{cursor:pointer}";
  document.documentElement.appendChild(css);
  function markHome() {
    var nodes = document.querySelectorAll(".rutt-n");
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || "").toLowerCase();
      if (t.indexOf("göteborg c") >= 0 || t.indexOf("goteborg c") >= 0) nodes[i].classList.add("is-home");
    }
  }
  function boot() {
    markHome();
    try {
      new MutationObserver(markHome).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
