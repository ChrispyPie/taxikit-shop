window.TAXIKIT_BUILD = "1.1.0-wip58";
window.TAXIKIT_CHANGELOG = [
  {
    ver: "1.1.0-wip58",
    date: "2026-09-04 · under utveckling",
    items: ["Fix: appen låste sig vid omladdning"]
  }
];

(function persistTab() {
  if (window.__taxikitPersist) return;
  window.__taxikitPersist = true;
  var KEY = "taxikit-tab";
  var SUB = "taxikit-flode-tab";
  document.addEventListener("click", function (ev) {
    var nav = ev.target.closest && ev.target.closest("[data-nav]");
    if (nav) try { localStorage.setItem(KEY, nav.getAttribute("data-nav")); } catch (e) {}
    var fl = ev.target.closest && ev.target.closest("[data-flode]");
    if (fl) try { localStorage.setItem(SUB, fl.getAttribute("data-flode")); } catch (e) {}
  }, true);
  function restore() {
    if (window.__taxikitRestored) return;
    window.__taxikitRestored = true;
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
  setTimeout(restore, 200);
})();

(function longPressStar() {
  if (window.__taxikitLongStar) return;
  window.__taxikitLongStar = true;
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
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) {
    document.addEventListener(n, clear, true);
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
  if (window.__taxikitRowUi58) return;
  window.__taxikitRowUi58 = true;
  var css = document.createElement("style");
  css.textContent =
    ".feed-item .feed-city{color:var(--fg);font-weight:800;font-size:0.95rem}" +
    ".feed-item .feed-idline{color:var(--muted);font-weight:650;font-size:0.78rem;margin-top:2px}" +
    ".feed-item .feed-event{color:var(--muted);font-weight:600}" +
    ".feed-item .feed-event.is-alert{color:#f07178}" +
    ".feed-item .feed-chips .feed-id{display:none}" +
    ".feed-chip.ank,.feed-chip.avg{display:none!important}" +
    "#dirSlider{display:none!important}" +
    "#flodeNowBtn,#flodeRefreshBtn,#flodeFilterBtn,#flodeStarAllBtn,.dir-mini{" +
      "border:1px solid #3a455c!important;border-radius:10px!important;" +
      "background:#151b27!important;min-width:36px;min-height:32px}" +
    ".dir-mini{display:flex;align-items:center;justify-content:center;gap:0;" +
      "margin:0 8px;padding:0 8px;height:32px;font:inherit}" +
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
    return "Regional";
  }
  function cleanCity(s) {
    return String(s || "").replace(/\s+[A-Z]{2}$/g, "").trim();
  }
  function parseClock(s) {
    var m = String(s || "").match(/(\d{2}):(\d{2})/);
    if (!m) return null;
    var now = new Date();
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2], 0, 0);
    var diff = t.getTime() - now.getTime();
    if (diff > 18 * 3600000) t.setDate(t.getDate() - 1);
    if (diff < -18 * 3600000) t.setDate(t.getDate() + 1);
    return t;
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
    if (document.getElementById("dirMini")) { paintMini(); return; }
    var refresh = document.getElementById("flodeRefreshBtn");
    if (!refresh || !refresh.parentNode) return;
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
    refresh.parentNode.insertBefore(box, refresh.nextSibling);
    paintMini();
  }
  function applyDir() {
    var want = currentDir();
    var rows = document.querySelectorAll("#flodeList .feed-item");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var hasAnk = !!row.querySelector(".feed-chip.ank");
      var hasAvg = !!row.querySelector(".feed-chip.avg");
      var hide = (want === "ank" && hasAvg) || (want === "avg" && hasAnk);
      if (hide) row.classList.add("dir-hide");
      else row.classList.remove("dir-hide");
    }
  }
  function fixFlightStatus(row) {
    if (row.getAttribute("data-flystat") === "58") return;
    var ev = row.querySelector(".feed-event");
    if (!ev) return;
    var txt = (ev.textContent || "").trim();
    if (/inställd|canceled|cancelled|borttagen|divert|omdiriger/i.test(txt)) {
      ev.classList.add("is-alert");
      row.setAttribute("data-flystat", "58");
      return;
    }
    var timeEl = row.querySelector(".feed-time");
    var planEl = row.querySelector(".feed-plan");
    var delay = row.querySelector(".feed-dev");
    var when = parseClock(timeEl && timeEl.textContent);
    var hasLive = !!(delay || (planEl && timeEl && planEl.textContent.replace(/[()]/g, "").trim() !== timeEl.textContent.trim()));
    var isDep = !!row.querySelector(".feed-chip.avg");
    if (when) {
      var mins = (when.getTime() - Date.now()) / 60000;
      if (mins < -8) ev.textContent = isDep ? "Avgånget" : "Landat";
      else if (hasLive && mins <= 240) ev.textContent = isDep ? "Startat" : "I luften";
      else if (hasLive) ev.textContent = "Beräknad";
      else if (/schemalagd/i.test(txt)) ev.textContent = "Schemalagd";
    }
    row.setAttribute("data-flystat", "58");
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
  var busy = false;
  function restyle() {
    if (busy) return;
    busy = true;
    try {
      ensureMini();
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
    } finally {
      busy = false;
    }
  }
  function boot() {
    restyle();
    var list = document.getElementById("flodeList");
    if (list) {
      var t = null;
      new MutationObserver(function () {
        if (t) return;
        t = setTimeout(function () { t = null; restyle(); }, 50);
      }).observe(list, { childList: true });
    } else {
      setTimeout(boot, 300);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 50);
})();
