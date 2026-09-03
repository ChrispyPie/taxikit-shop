window.TAXIKIT_BUILD = "1.1.0-wip51";
window.TAXIKIT_CHANGELOG = [
  {
    ver: "1.1.0-wip51",
    date: "2026-09-03 · under utveckling",
    items: [
      "Tåglistan: ortnamn överst i vitt",
      "Rad 2: tågtyp + beteckning i grått",
      "Ingen landskod på tågraden"
    ]
  },
  {
    ver: "1.1.0-wip50",
    date: "2026-09-03",
    items: [
      "Stationslistan: heldragen linje utan luckor",
      "Spår visas bara på Göteborg C"
    ]
  }
];

(function restyleTrainRows() {
  if (window.__taxikitTrainUi) return;
  window.__taxikitTrainUi = true;
  var css = document.createElement("style");
  css.textContent =
    ".feed-item .feed-city{color:var(--fg);font-weight:800;font-size:0.95rem}" +
    ".feed-item .feed-idline{color:var(--muted);font-weight:650;font-size:0.78rem;margin-top:2px}" +
    ".feed-item .feed-event{color:var(--muted);font-weight:600}" +
    ".feed-item .feed-chips .feed-id{display:none}";
  document.documentElement.appendChild(css);
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
  function restyle() {
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
  }
  function boot() {
    restyle();
    try {
      new MutationObserver(restyle).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
