window.TAXIKIT_BUILD = "1.1.0-wip53";
window.TAXIKIT_CHANGELOG = [
  {
    ver: "1.1.0-wip53",
    date: "2026-09-03 · under utveckling",
    items: [
      "Ank/Avg som liten text i menyraden",
      "Tryck Ank, Avg eller båda vita"
    ]
  },
  {
    ver: "1.1.0-wip52",
    date: "2026-09-03",
    items: ["Första Ank/Avg-reglaget"]
  }
];

(function restyleTrainRows() {
  if (window.__taxikitTrainUi53) return;
  window.__taxikitTrainUi53 = true;
  var css = document.createElement("style");
  css.textContent =
    ".feed-item .feed-city{color:var(--fg);font-weight:800;font-size:0.95rem}" +
    ".feed-item .feed-idline{color:var(--muted);font-weight:650;font-size:0.78rem;margin-top:2px}" +
    ".feed-item .feed-event{color:var(--muted);font-weight:600}" +
    ".feed-item .feed-chips .feed-id{display:none}" +
    ".feed-chip.ank,.feed-chip.avg{display:none!important}" +
    "#dirSlider{display:none!important}" +
    ".dir-mini{display:flex;align-items:center;gap:5px;margin:0 4px;padding:0 2px;height:36px;background:none;border:0;font:inherit}" +
    ".dir-mini b{font-size:0.72rem;font-weight:800;letter-spacing:.03em;color:var(--muted);padding:4px 2px}" +
    ".dir-mini b.on{color:var(--fg)}" +
    ".dir-mini i{font-style:normal;color:var(--muted);font-size:0.72rem;opacity:.5}" +
    ".feed-item.dir-hide{display:none!important}";
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
  function currentDir() {
    try {
      var v = localStorage.getItem("taxikit-dir");
      if (v === "avg" || v === "ank" || v === "both") return v;
    } catch (e) {}
    return "both";
  }
  function setDir(dir) {
    try { localStorage.setItem("taxikit-dir", dir); } catch (e) {}
    paintMini();
    applyDir();
  }
  function paintMini() {
    var d = currentDir();
    var a = document.getElementById("dirAnk");
    var g = document.getElementById("dirAvg");
    if (a) a.classList.toggle("on", d === "ank" || d === "both");
    if (g) g.classList.toggle("on", d === "avg" || d === "both");
  }
  function ensureMini() {
    if (document.getElementById("dirMini")) return;
    var filter = document.getElementById("flodeFilterBtn");
    var host = filter && filter.parentNode;
    if (!host) return;
    var box = document.createElement("div");
    box.id = "dirMini";
    box.className = "dir-mini";
    box.innerHTML = '<b id="dirAnk">Ank</b><i>/</i><b id="dirAvg">Avg</b>';
    box.addEventListener("click", function (ev) {
      var t = ev.target;
      if (t && t.id === "dirAnk") {
        setDir(currentDir() === "ank" ? "both" : "ank");
      } else if (t && t.id === "dirAvg") {
        setDir(currentDir() === "avg" ? "both" : "avg");
      } else {
        var cur = currentDir();
        setDir(cur === "both" ? "ank" : cur === "ank" ? "avg" : "both");
      }
    });
    host.insertBefore(box, filter);
    paintMini();
  }
  function applyDir() {
    var want = currentDir();
    var rows = document.querySelectorAll("#flodeList .feed-item");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var hasAnk = !!row.querySelector(".feed-chip.ank");
      var hasAvg = !!row.querySelector(".feed-chip.avg");
      var hide = false;
      if (want === "ank" && hasAvg) hide = true;
      if (want === "avg" && hasAnk) hide = true;
      row.classList.toggle("dir-hide", hide);
    }
  }
  function restyle() {
    ensureMini();
    paintMini();
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
    applyDir();
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
