window.TAXIKIT_BUILD = "1.1.0-wip52";
window.TAXIKIT_CHANGELOG = [
  {
    ver: "1.1.0-wip52",
    date: "2026-09-03 · under utveckling",
    items: [
      "Ank/Avg-reglage ovanför listan",
      "ANK/AVG-taggar bort från raderna"
    ]
  },
  {
    ver: "1.1.0-wip51",
    date: "2026-09-03",
    items: [
      "Tåglistan: ortnamn överst i vitt",
      "Rad 2: tågtyp + beteckning i grått"
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
    ".feed-item .feed-chips .feed-id{display:none}" +
    ".feed-chip.ank,.feed-chip.avg{display:none!important}" +
    ".dir-slider{display:flex;align-items:center;justify-content:center;gap:10px;padding:6px 12px 2px;user-select:none}" +
    ".dir-slider span{font-size:0.78rem;font-weight:800;letter-spacing:.04em;color:var(--muted);transition:color .15s}" +
    ".dir-slider[data-dir=ank] .dir-ank,.dir-slider[data-dir=avg] .dir-avg{color:var(--fg)}" +
    ".dir-track{width:52px;height:22px;border-radius:99px;background:#1b2130;border:1px solid #2a3346;position:relative;flex:none}" +
    ".dir-knob{position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:#eef1f6;transition:left .15s}" +
    ".dir-slider[data-dir=ank] .dir-knob{left:3px}" +
    ".dir-slider[data-dir=avg] .dir-knob{left:31px}" +
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
    try { return localStorage.getItem("taxikit-dir") === "avg" ? "avg" : "ank"; }
    catch (e) { return "ank"; }
  }
  function setDir(dir) {
    try { localStorage.setItem("taxikit-dir", dir); } catch (e) {}
    var sl = document.getElementById("dirSlider");
    if (sl) sl.setAttribute("data-dir", dir);
    applyDir();
  }
  function ensureSlider() {
    if (document.getElementById("dirSlider")) return;
    var list = document.getElementById("flodeList");
    if (!list || !list.parentNode) return;
    var box = document.createElement("div");
    box.id = "dirSlider";
    box.className = "dir-slider";
    box.setAttribute("data-dir", currentDir());
    box.innerHTML = '<span class="dir-ank">ANK</span><div class="dir-track" role="switch" aria-label="Ankomst eller avgång"><div class="dir-knob"></div></div><span class="dir-avg">AVG</span>';
    box.addEventListener("click", function () {
      setDir(currentDir() === "ank" ? "avg" : "ank");
    });
    list.parentNode.insertBefore(box, list);
  }
  function applyDir() {
    var want = currentDir();
    var rows = document.querySelectorAll("#flodeList .feed-item");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var hasAnk = !!row.querySelector(".feed-chip.ank");
      var hasAvg = !!row.querySelector(".feed-chip.avg");
      var hide = false;
      if (hasAnk && want === "avg") hide = true;
      if (hasAvg && want === "ank") hide = true;
      row.classList.toggle("dir-hide", hide);
    }
  }
  function restyle() {
    ensureSlider();
    var sl = document.getElementById("dirSlider");
    if (sl) sl.setAttribute("data-dir", currentDir());
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
