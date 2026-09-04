window.TAXIKIT_BUILD = "1.1.0-wip65";
window.TAXIKIT_CHANGELOG = [
  {
    ver: "1.1.0-wip65",
    date: "2026-09-04 · under utveckling",
    items: ["Båt: Stena expansionskort", "Samma 3-raders vy som flyg/tåg"]
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

(function keepFlodePlace() {
  if (window.__taxikitKeepPlace63) return;
  window.__taxikitKeepPlace63 = true;
  var snap = { y: 0, open: {}, rutt: {} };
  var pinNow = false;
  function snapshot() {
    if (pinNow) return;
    snap.y = window.scrollY || 0;
    snap.open = {};
    snap.rutt = {};
    var rows = document.querySelectorAll("#flodeList .feed-item[data-sid]");
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].getAttribute("data-sid");
      if (rows[i].classList.contains("open")) snap.open[id] = 1;
      if (rows[i].classList.contains("rutt-open")) snap.rutt[id] = 1;
    }
  }
  function restorePlace() {
    if (pinNow) return;
    var rows = document.querySelectorAll("#flodeList .feed-item[data-sid]");
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].getAttribute("data-sid");
      if (snap.open[id]) {
        rows[i].classList.add("open");
        var rr = rows[i].querySelector(".rutt");
        if (rr && snap.rutt[id]) {
          rows[i].classList.add("rutt-open");
          rr.classList.remove("collapsed");
        }
      }
    }
    window.scrollTo(0, snap.y);
  }
  document.addEventListener("click", function (ev) {
    if (ev.target.closest && ev.target.closest("#flodeNowBtn")) {
      pinNow = true;
      snap.open = {};
      snap.rutt = {};
      setTimeout(function () { pinNow = false; snapshot(); }, 800);
      return;
    }
    if (ev.target.closest && ev.target.closest("#flodeRefreshBtn")) {
      snapshot();
      [50, 120, 250, 500, 900].forEach(function (ms) { setTimeout(restorePlace, ms); });
      return;
    }
    if (ev.target.closest && ev.target.closest("#flodeList")) snapshot();
  }, true);
  setInterval(function () { if (!pinNow) snapshot(); }, 1500);
  function watch() {
    var list = document.getElementById("flodeList");
    if (!list) { setTimeout(watch, 300); return; }
    new MutationObserver(function () {
      if (pinNow) return;
      restorePlace();
      setTimeout(restorePlace, 80);
    }).observe(list, { childList: true });
  }
  watch();
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
  if (window.__taxikitRowUi65) return;
  window.__taxikitRowUi65 = true;
  var css = document.createElement("style");
  css.textContent =
    ".feed-item .feed-city{color:var(--fg);font-weight:800;font-size:0.95rem}" +
    ".feed-item .feed-idline{color:var(--muted);font-weight:650;font-size:0.78rem;margin-top:2px}" +
    ".feed-item .feed-event{color:var(--muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".feed-item .feed-event.is-alert{color:#f07178}" +
    ".feed-item .feed-chips .feed-id{display:none!important}" +
    ".feed-item .feed-meta{display:none!important}" +
    ".feed-item .feed-type{display:none!important}" +
    ".feed-chip.ank,.feed-chip.avg{display:none!important}" +
    "#dirSlider{display:none!important}" +
    "#flodeNowBtn,#flodeRefreshBtn,#flodeFilterBtn,#flodeStarAllBtn,.dir-mini{" +
      "border:1px solid #3a455c!important;border-radius:10px!important;" +
      "background:#151b27!important;min-width:36px;min-height:32px}" +
    ".dir-mini{display:flex;align-items:center;justify-content:center;gap:0;margin:0 8px;padding:0 8px;height:32px;font:inherit}" +
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
  function cleanCity(s) { return String(s || "").replace(/\s+[A-Z]{2}$/g, "").trim(); }
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
  function hhmm(d) {
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
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
  function hidePair(k) {
    var v = k && k.nextElementSibling;
    k.style.display = "none";
    if (v) v.style.display = "none";
  }
  function emptyVal(val) {
    return !val || val === "—" || val === "-" || val === "–";
  }
  function kvHtml(k, v) {
    return '<div class="feed-k">' + k + '</div><div class="feed-v">' + v + "</div>";
  }
  function tidyBoatExtra(row) {
    if (row.getAttribute("data-boatex") === "1") return;
    var title = ((row.querySelector(".feed-id") || {}).textContent || "").trim();
    var isDep = !!row.querySelector(".feed-chip.avg");
    var timeEl = row.querySelector(".feed-time");
    var when = parseClock(timeEl && timeEl.textContent);
    var extra = row.querySelector(".feed-extra");
    if (!extra) return;
    var rows = [];
    if (/stena danmark/i.test(title)) {
      rows.push(kvHtml("Kaj", "Danmarksterminalen"));
      rows.push(kvHtml(isDep ? "Mot" : "Från", "Frederikshavn"));
      rows.push(kvHtml("Restid", "3 t 35 min"));
      if (when && isDep) {
        var eta = new Date(when.getTime() + 215 * 60000);
        rows.push(kvHtml("Framme", hhmm(eta)));
      }
    } else if (/stena kiel/i.test(title)) {
      rows.push(kvHtml("Kaj", "Älvsborgshamnen"));
      rows.push(kvHtml(isDep ? "Mot" : "Från", "Kiel"));
      rows.push(kvHtml("Restid", "ca 14 t"));
      if (when && isDep) {
        var eta2 = new Date(when.getTime() + 14 * 3600000 + 30 * 60000);
        rows.push(kvHtml("Framme", hhmm(eta2) + " +1"));
      }
    } else if (/hönö/i.test(title)) {
      rows.push(kvHtml("Kaj", "Lilla Varholmen"));
      rows.push(kvHtml("Mot", "Hönö"));
      rows.push(kvHtml("Täthet", "var 20:e min"));
      rows.push(kvHtml("Restid", "ca 13 min"));
    } else if (/kornhall/i.test(title)) {
      row.style.display = "none";
      row.setAttribute("data-boatex", "1");
      return;
    }
    if (rows.length) extra.innerHTML = '<div class="feed-kv">' + rows.join("") + "</div>";
    row.setAttribute("data-boatex", "1");
  }
  function fixBoatStatus(row) {
    var ev = row.querySelector(".feed-event");
    if (!ev) return;
    var title = ((row.querySelector(".feed-id") || {}).textContent || "").trim();
    if (/kornhall/i.test(title)) return;
    var isDep = !!row.querySelector(".feed-chip.avg");
    var when = parseClock((row.querySelector(".feed-time") || {}).textContent);
    if (!when) return;
    var mins = (when.getTime() - Date.now()) / 60000;
    if (mins < -8) ev.textContent = isDep ? "Avgånget" : "Framme";
    else if (mins <= 15) ev.textContent = isDep ? "Avgår snart" : "Ankommer snart";
    else ev.textContent = isDep ? "Avgår" : "Ankommer";
  }
  function tidyFlightExtra(row) {
    var box = row.querySelector(".feed-kv");
    if (!box || box.getAttribute("data-tidy") === "1") return;
    var evEl = row.querySelector(".feed-event");
    var eventTxt = evEl ? evEl.textContent.trim() : "";
    if (evEl && eventTxt.indexOf(" · ") >= 0) evEl.textContent = eventTxt.split(" · ")[0];
    eventTxt = evEl ? evEl.textContent.trim() : "";
    var map = {};
    var keys = box.querySelectorAll(".feed-k");
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = k.nextElementSibling;
      map[(k.textContent || "").trim()] = { k: k, v: v, val: v ? (v.textContent || "").trim() : "" };
    }
    if (map.Status) hidePair(map.Status.k);
    if (map.Info) hidePair(map.Info.k);
    var bagText = "—";
    var lastT = map.Sista && !emptyVal(map.Sista.val) ? map.Sista.val : "";
    var firstT = map.Väska && !emptyVal(map.Väska.val) ? map.Väska.val : "";
    if (lastT) bagText = "Sista " + lastT;
    else if (firstT && /landat|framme|första/i.test(eventTxt)) bagText = "Första " + firstT;
    else if (firstT) bagText = "Beräknad " + firstT;
    if (map.Väska) hidePair(map.Väska.k);
    if (map.Sista) hidePair(map.Sista.k);
    var bk = document.createElement("div");
    bk.className = "feed-k";
    bk.textContent = "Bagage";
    var bv = document.createElement("div");
    bv.className = "feed-v";
    bv.textContent = bagText;
    var band = map.Band && map.Band.k;
    if (band) box.insertBefore(bv, band);
    else box.appendChild(bv);
    box.insertBefore(bk, bv);
    if (map.Land && emptyVal(map.Land.val)) hidePair(map.Land.k);
    if (map.Gate && emptyVal(map.Gate.val)) hidePair(map.Gate.k);
    if (map.Band && emptyVal(map.Band.val)) hidePair(map.Band.k);
    box.setAttribute("data-tidy", "1");
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
    }
    row.setAttribute("data-flystat", "58");
  }
  function restyleOne(row, kind) {
    var extras = row.querySelectorAll(".feed-idline,.feed-city");
    for (var x = 0; x < extras.length; x++) extras[x].parentNode.removeChild(extras[x]);
    var idEl = row.querySelector(".feed-id");
    var meta = row.querySelector(".feed-meta");
    var titleBox = row.querySelector(".feed-title");
    if (!titleBox) return;
    var ident = idEl ? (idEl.textContent || "").trim() : "";
    ident = ident.replace(/\s+[A-Z]{3}$/, "");
    var city = cleanCity(meta ? meta.textContent : "");
    if (kind === "bat" && /stena danmark/i.test(ident)) city = "Frederikshavn";
    if (kind === "bat" && /stena kiel/i.test(ident)) city = "Kiel";
    if (kind === "bat" && /hönö/i.test(ident)) city = "Lilla Varholmen";
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
          tidyFlightExtra(row);
        } else if (row.querySelector(".feed-chip.tag")) {
          restyleOne(row, "tag");
        } else if (row.querySelector(".feed-chip.bat")) {
          restyleOne(row, "bat");
          fixBoatStatus(row);
          tidyBoatExtra(row);
        }
      }
      applyDir();
    } finally { busy = false; }
  }
  function boot() {
    restyle();
    var list = document.getElementById("flodeList");
    if (list) {
      var t = null;
      new MutationObserver(function () {
        if (t) return;
        t = setTimeout(function () { t = null; restyle(); }, 80);
      }).observe(list, { childList: true });
    } else setTimeout(boot, 300);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 50);
})();
