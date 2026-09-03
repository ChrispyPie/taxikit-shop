window.TAXIKIT_BUILD = "1.1.0-wip55";
window.TAXIKIT_CHANGELOG = [
  {
    ver: "1.1.0-wip55",
    date: "2026-09-03 · under utveckling",
    items: ["Flyglistan samma layout som tåg: ort vitt, nummer och status grått"]
  }
];

(function persistTab() {
  var KEY = "taxikit-tab";
  var SUB = "taxikit-flode-tab";
  document.addEventListener("click", function (ev) {
    var nav = ev.target.closest && ev.target.closest("[data-nav]");
    if (nav) try { localStorage.setItem(KEY, nav.getAttribute("data-nav")); } catch (e) {}
    var fl = ev.target.closest && ev.target.closest("[data-flode]");
    if (fl) try { localStorage.setItem(SUB, fl.getAttribute("data-flode")); } catch (e) {}
  }, true);
  function restore() {
    var tab, sub;
    try { tab = localStorage.getItem(KEY); sub = localStorage.getItem(SUB); } catch (e) { return; }
    if (tab && tab !== "skift") {
      var btn = document.querySelector('[data-nav="' + tab + '"]');
      if (btn) btn.click();
    }
    if (sub && sub !== "summary") {
      var sbtn = document.querySelector('[data-flode="' + sub + '"]');
      if (sbtn) sbtn.click();
    }
  }
  setTimeout(restore, 80);
  setTimeout(restore, 400);
})();

(function longPressStar() {
  var timer = null, armed = null;
  function isItemStar(el) {
    return el && el.classList && el.classList.contains("feed-star") && el.id !== "flodeStarAllBtn";
  }
  function clear() { if (timer) { clearTimeout(timer); timer = null; } }
  document.addEventListener("pointerdown", function (ev) {
    var btn = ev.target.closest && ev.target.closest(".feed-star");
    if (!isItemStar(btn)) return;
    clear();
    timer = setTimeout(function () {
      timer = null; armed = btn;
      try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
      btn.click();
    }, 480);
  }, true);
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
    document.addEventListener(name, clear, true);
  });
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest(".feed-star");
    if (!isItemStar(btn)) return;
    if (armed === btn) { armed = null; return; }
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }, true);
})();

(function restyleRows() {
  if (window.__taxikitRowUi55) return;
  window.__taxikitRowUi55 = true;
  var css = document.createElement("style");
  css.textContent =
    ".feed-item .feed-city{color:var(--fg);font-weight:800;font-size:0.95rem}" +
    ".feed-item .feed-idline{color:var(--muted);font-weight:650;font-size:0.78rem;margin-top:2px}" +
    ".feed-item .feed-event{color:var(--muted);font-weight:600}" +
    ".feed-item .feed-event.is-alert{color:#f07178}" +
    ".feed-item .feed-chips .feed-id{display:none}" +
    ".feed-chip.ank,.feed-chip.avg{display:none!important}" +
    "#dirSlider{display:none!important}" +
    ".dir-mini{display:flex;align-items:center;gap:0;margin:0 10px 0 -18px;padding:0;height:36px;background:none;border:0;font:inherit;letter-spacing:-0.02em}" +
    ".dir-mini b{font-size:0.7rem;font-weight:800;color:var(--muted);padding:4px 0}" +
    ".dir-mini b.on{color:var(--fg)}" +
    ".dir-mini i{font-style:normal;color:var(--muted);font-size:0.7rem;opacity:.45;padding:0 1px}" +
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
    return String(s || "").replace(/\s+[A-Z]{2}$/g, "").trim();
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
      if (t && t.id === "dirAnk") setDir(currentDir() === "ank" ? "both" : "ank");
      else if (t && t.id === "dirAvg") setDir(currentDir() === "avg" ? "both" : "avg");
      else {
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
  function fixFlightStatus(row) {
    var ev = row.querySelector(".feed-event");
    if (!ev) return;
    var txt = (ev.textContent || "").trim();
    if (txt === "Schemalagd") {
      var delay = row.querySelector(".feed-dev");
      var timeEl = row.querySelector(".feed-time");
      var planEl = row.querySelector(".feed-plan");
      var hhmm = timeEl ? timeEl.textContent.trim() : "";
      var passed = false;
      if (/^\d{2}:\d{2}$/.test(hhmm)) {
        var p = hhmm.split(":");
        var t = new Date();
        t.setHours(+p[0], +p[1], 0, 0);
        if (t.getTime() < Date.now() - 3 * 60000) passed = true;
      }
      if (passed) ev.textContent = "Avgånget/Landat";
      else if (delay || (planEl && timeEl && planEl.textContent.replace(/[()]/g, "") !== hhmm)) ev.textContent = "Beräknad";
      txt = ev.textContent;
    }
    if (/inställd|canceled|cancelled|borttagen|divert|omdiriger/i.test(txt)) ev.classList.add("is-alert");
  }
  function restyleOne(row, kind) {
    if (row.getAttribute("data-rowui") === "55") return;
    var idEl = row.querySelector(".feed-id");
    var meta = row.querySelector(".feed-meta");
    var titleBox = row.querySelector(".feed-title");
    if (!titleBox) return;
    var ident = idEl ? (idEl.textContent || "").trim() : "";
    var city = cleanCity(meta ? meta.textContent : "");
    if (city) {
      var cityEl = document.createElement("span");
      cityEl.className = "feed-city";
      cityEl.textContent = city;
      titleBox.appendChild(cityEl);
    }
    if (ident) {
      var line = document.createElement("div");
      line.className = "feed-idline";
      line.textContent = kind === "tag" ? (trainType(ident) + " · " + ident) : ident;
      titleBox.parentNode.insertBefore(line, titleBox.nextSibling);
    }
    if (meta) meta.style.display = "none";
    row.setAttribute("data-rowui", "55");
  }
  function restyle() {
    ensureMini();
    paintMini();
    var rows = document.querySelectorAll("#flodeList .feed-item");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.querySelector(".feed-chip.flyg")) {
        restyleOne(row, "flyg");
        fixFlightStatus(row);
      } else if (row.querySelector(".feed-chip.tag")) {
        restyleOne(row, "tag");
      }
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
