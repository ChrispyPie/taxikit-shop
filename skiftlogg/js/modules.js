/* Taxikit module registry + small live patches I can push. */
window.TAXIKIT_BUILD = "1.1.0-wip51";
window.TAXIKIT_MODULES = [
  { id: "skift", label: "SKIFT", enabled: true },
  { id: "flode", label: "FLÖDE", enabled: true },
  { id: "trafik", label: "TRAFIK", enabled: true }
];

(function loadChangelog() {
  var s = document.createElement("script");
  s.src = "js/changelog.js?v=" + Date.now();
  s.onload = function () {
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
    ".feed-item .feed-chips .feed-id{display:none}";
  document.documentElement.appendChild(css);
  function markHome() {
    var nodes = document.querySelectorAll(".rutt-n");
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || "").toLowerCase();
      if (t.indexOf("göteborg c") >= 0 || t.indexOf("goteborg c") >= 0) nodes[i].classList.add("is-home");
    }
  }
  function trainType(title) {
    var t = String(title || "");
    if (/^[ÖO]T/i.test(t)) return "Öresundståg";
    if (/^VT/i.test(t)) return "Västtågen";
    if (/^(SX|X2)/i.test(t)) return "Snabbtåg";
    if (/^SJ/i.test(t)) return "SJ";
    if (/^VY/i.test(t)) return "VY";
    if (/^MÄL/i.test(t)) return "Mälartåg";
    return "Regional";
  }
  function cleanCity(s) {
    return String(s || "").replace(/\s+(SE|DK|NO|FI|DE)$/i, "").trim();
  }
  function restyleTrains() {
    var rows = document.querySelectorAll("#flodeList .feed-item");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute("data-trainui") === "51") continue;
      if (!row.querySelector(".feed-chip.tag")) continue;
      var idEl = row.querySelector(".feed-id");
      var meta = row.querySelector(".feed-meta");
      var titleBox = row.querySelector(".feed-title");
      if (!idEl || !titleBox) continue;
      var ident = (idEl.textContent || "").trim();
      var city = cleanCity(meta ? meta.textContent : "");
      var cityEl = document.createElement("span");
      cityEl.className = "feed-city";
      cityEl.textContent = city;
      titleBox.appendChild(cityEl);
      var line = document.createElement("div");
      line.className = "feed-idline";
      line.textContent = trainType(ident) + " · " + ident;
      titleBox.parentNode.insertBefore(line, titleBox.nextSibling);
      if (meta) meta.style.display = "none";
      row.setAttribute("data-trainui", "51");
    }
    markHome();
  }
  function boot() {
    markHome();
    restyleTrains();
    try {
      new MutationObserver(function () {
        markHome();
        restyleTrains();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
