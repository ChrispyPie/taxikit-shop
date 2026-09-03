/* app-1.js */
(function () {
  "use strict";

  var STORAGE_KEY = "taxigbg-v1";
  var MONTHS_SV = [
    "Januari", "Februari", "Mars", "April", "Maj", "Juni",
    "Juli", "Augusti", "September", "Oktober", "November", "December"
  ];
  var MONTHS_SHORT_SV = [
    "Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"
  ];

  var DEFAULT_STATE = {
    weekGoal: 25000,
    monthGoal: 100000,
    activeShift: null,
    shifts: [],
    uberReports: []
  };

  var state = loadState();
  var modalResolve = null;
  var modalMode = null;
  var editingId = null;
  var tickTimer = null;
  var toastTimer = null;

  // Cloud / Firebase
  var fbReady = false;
  var fbUser = null;
  var db = null;
  var auth = null;
  var syncTimer = null;
  var syncInFlight = false;
  var lastSyncAt = null;
  var lastSyncError = null;
  var pendingDeletedIds = [];

  // Dashboard period selection (any day in the target week/month)
  // History mode + refs
  var historyMode = "day"; // day | week | month
  var dayEditUnlocked = false;
  var dayEditShiftId = null;
  var histWeekRef = startOfISOWeek(new Date());
  var histMonthRef = startOfMonth(new Date());

  function $(id) { return document.getElementById(id); }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(DEFAULT_STATE);
      var parsed = JSON.parse(raw);
      return {
        weekGoal: Number(parsed.weekGoal) || DEFAULT_STATE.weekGoal,
        monthGoal: Number(parsed.monthGoal) || DEFAULT_STATE.monthGoal,
        activeShift: parsed.activeShift || null,
        shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
        uberReports: Array.isArray(parsed.uberReports) ? parsed.uberReports : []
      };
    } catch (e) {
      return clone(DEFAULT_STATE);
    }
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function touchShiftUpdatedAt(s) {
    if (!s) return s;
    if (!s.updatedAt) s.updatedAt = Date.now();
    return s;
  }

  function saveState(opts) {
    // Ensure timestamps for merge
    if (state.activeShift && !state.activeShift.updatedAt) {
      state.activeShift.updatedAt = Date.now();
    }
    state.shifts.forEach(function (s) {
      if (!s.updatedAt) s.updatedAt = Date.now();
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!opts || opts.sync !== false) {
      scheduleCloudSync();
    }
  }

  function markShiftsUpdated(ids) {
    var now = Date.now();
    var set = {};
    (ids || []).forEach(function (id) { set[id] = true; });
    state.shifts.forEach(function (s) {
      if (!ids || set[s.id]) s.updatedAt = now;
    });
    if (state.activeShift && (!ids || set[state.activeShift.id])) {
      state.activeShift.updatedAt = now;
    }
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toDateKey(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /** YY/MM/DD – kortare än ISO med bindestreck */
  function formatCompactDateKey(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
    if (!m) return key || "";
    return m[1].slice(2) + "/" + m[2] + "/" + m[3];
  }

  function formatYearShort(y) {
    return "'" + String(y).slice(2);
  }

  /** Always YYYY-MM-DD HH:MM */
  function formatDateTime(iso) {
    var d = new Date(iso);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function formatDateOnly(isoOrDate) {
    var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function formatMoney(n) {
    return Math.round(Number(n) || 0).toLocaleString("sv-SE") + " kr";
  }

  function formatHours(ms) {
    if (ms < 0) ms = 0;
    var totalMin = Math.floor(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h === 0) return m + " min";
    if (m === 0) return h + " h";
    return h + " h " + m + " min";
  }

  function formatHoursDecimal(ms) {
    return (ms / 3600000).toLocaleString("sv-SE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + " h";
  }

  function getISOWeek(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function getISOWeekYear(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    return d.getUTCFullYear();
  }

  /** Monday of ISO week (week, year) */
  function dateFromISOWeek(week, year) {
    // Jan 4 is always in week 1
    var jan4 = new Date(year, 0, 4);
    var start = startOfISOWeek(jan4);
    start.setDate(start.getDate() + (week - 1) * 7);
    return start;
  }

  function weeksInISOYear(year) {
    // Week of Dec 28 is always the last ISO week of the year
    return getISOWeek(new Date(year, 11, 28));
  }

  function startOfISOWeek(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfISOWeek(date) {
    var s = startOfISOWeek(date);
    var e = new Date(s);
    e.setDate(e.getDate() + 7);
    return e;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  function daysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function parseDateCompact(str) {
    var s = String(str).replace(/\D/g, "");
    var year, month, day;
    if (s.length === 6) {
      var yy = parseInt(s.slice(0, 2), 10);
      year = yy >= 70 ? 1900 + yy : 2000 + yy;
      month = parseInt(s.slice(2, 4), 10) - 1;
      day = parseInt(s.slice(4, 6), 10);
    } else if (s.length === 8) {
      year = parseInt(s.slice(0, 4), 10);
      month = parseInt(s.slice(4, 6), 10) - 1;
      day = parseInt(s.slice(6, 8), 10);
    } else {
      return null;
    }
    var d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
    return d;
  }

  function parseTimeCompact(str) {
    var s = String(str).replace(/\D/g, "");
    if (s.length !== 3 && s.length !== 4) return null;
    var padded = s.padStart(4, "0");
    var h = parseInt(padded.slice(0, 2), 10);
    var m = parseInt(padded.slice(2, 4), 10);
    if (h > 23 || m > 59) return null;
    return { h: h, m: m };
  }

  /** Display value for edit form: YYYY-MM-DD */
  function toEditDate(iso) {
    return formatDateOnly(iso);
  }

  function toCompactTime(iso) {
    var d = new Date(iso);
    return pad2(d.getHours()) + pad2(d.getMinutes());
  }

  function combineDateTime(dateStr, timeStr) {
    // Accept YYYY-MM-DD, YYYYMMDD, or YYMMDD
    var d = null;
    var cleaned = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      var parts = cleaned.split("-");
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (
        d.getFullYear() !== parseInt(parts[0], 10) ||
        d.getMonth() !== parseInt(parts[1], 10) - 1 ||
        d.getDate() !== parseInt(parts[2], 10)
      ) {
        d = null;
      }
    } else {
      d = parseDateCompact(cleaned);
    }
    var t = parseTimeCompact(timeStr);
    if (!d || !t) return null;
    d.setHours(t.h, t.m, 0, 0);
    return d;
  }

  function isActive() {
    return !!state.activeShift;
  }

  function completedShifts() {
    return state.shifts.filter(function (s) {
      return s.end && s.amount != null;
    }).map(normalizeShift);
  }

  function normalizeShift(s) {
    if (!s) return s;
    // Prefer explicit km; fall back to legacy odoStart/odoEnd if present
    var km = null;
    if (s.km != null && Number.isFinite(Number(s.km))) {
      km = Number(s.km);
    } else if (s.odoStart != null && s.odoEnd != null) {
      var a = Number(s.odoStart);
      var b = Number(s.odoEnd);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) km = b - a;
    }
    return {
      id: s.id,
      start: s.start,
      end: s.end || null,
      amount: s.amount != null ? s.amount : null,
      uberGross: s.uberGross != null ? Number(s.uberGross) : 0,
      tips: s.tips != null ? Number(s.tips) : 0,
      bonus: s.bonus != null ? Number(s.bonus) : 0,
      km: km,
      odoStart: s.odoStart != null ? Number(s.odoStart) : null,
      breaks: Array.isArray(s.breaks) ? s.breaks.filter(function (b) {
        return b && b.start && b.end;
      }) : [],
      updatedAt: s.updatedAt || null,
      _active: s._active
    };
  }

  function getBreaks(s) {
    return Array.isArray(s && s.breaks) ? s.breaks : [];
  }

  function breakDurationMs(s) {
    return getBreaks(s).reduce(function (sum, b) {
      return sum + Math.max(0, new Date(b.end) - new Date(b.start));
    }, 0);
  }

  function shiftDurationMs(s) {
    var end = s.end ? new Date(s.end) : new Date();
    var raw = Math.max(0, end - new Date(s.start));
    return Math.max(0, raw - breakDurationMs(s));
  }

  function getLastCompletedShift() {
    var done = completedShifts().slice().sort(function (a, b) {
      return new Date(b.end) - new Date(a.end);
    });
    return done.length ? done[0] : null;
  }

  function shiftsInRange(from, to) {
    return completedShifts().filter(function (s) {
      var start = new Date(s.start);
      return start >= from && start < to;
    });
  }

  /** Skift som startade inom [from, to) – skiftdag = startdatum (00:00-dygn). */
  function shiftsStartingInRange(from, to) {
    return state.shifts.filter(function (s) {
      var start = new Date(s.start);
      return start >= from && start < to;
    }).sort(function (a, b) {
      return new Date(a.start) - new Date(b.start);
    });
  }

  function countDaysLeft(now, endExclusive) {
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = 0;
    var cur = new Date(today);
    while (cur < endExclusive) {
      days++;
      cur.setDate(cur.getDate() + 1);
    }
    return Math.max(0, days);
  }

  /**
   * Kvarvarande skift = återstående kalenderdagar i perioden (max 1 skift/dag).
   * Idag räknas med om det inte redan finns ett avslutat skift med start idag.
   * Pågående skift tar inte bort dagens plats (skiftet är inte klart).
   */
  function remainingShiftSlots(from, to, now) {
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (today >= to) return 0;
    var start = today < from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : today;
    var days = 0;
    var cur = new Date(start);
    while (cur < to) {
      days++;
      cur.setDate(cur.getDate() + 1);
    }
    if (days <= 0) return 0;

    var todayKey = toDateKey(today);
    var fromKey = toDateKey(from);
    var completedToday = completedShifts().some(function (s) {
      var st = new Date(s.start);
      return st >= from && st < to && toDateKey(st) === todayKey;
    });
    var activeStartKey = null;
    if (state.activeShift && state.activeShift.start) {
      var aStart = new Date(state.activeShift.start);
      if (aStart >= from && aStart < to) activeStartKey = toDateKey(aStart);
    }
    var activeToday = activeStartKey === todayKey;
    // Finished a shift today and no active → today no longer counts
    if (completedToday && !activeToday && today >= from && today < to) {
      days = Math.max(0, days - 1);
    }
    // Night shift still running past midnight: start day is still a remaining slot
    if (activeStartKey && activeStartKey < todayKey && activeStartKey >= fromKey) {
      days += 1;
    }
    return days;
  }

  /** Stick to active shift's start day when browsing "current" past midnight */
  function effectiveTodayKey() {
    if (state.activeShift && state.activeShift.start) {
      return toDateKey(new Date(state.activeShift.start));
    }
    return toDateKey(new Date());
  }

  function computePeriodStats(from, to, now, goal, isWeek) {
    var shifts = shiftsInRange(from, to);
    var completedMs = 0;
    var totalAmount = 0;
    shifts.forEach(function (s) {
      completedMs += shiftDurationMs(s);
      totalAmount += Number(s.amount) || 0;
    });

    var totalMs = completedMs;
    if (state.activeShift) {
      var aStart = new Date(state.activeShift.start);
      if (aStart >= from && aStart < to) {
        totalMs += shiftDurationMs({
          start: state.activeShift.start,
          end: null,
          breaks: state.activeShift.breaks || []
        });
      }
    }

    var hours = totalMs / 3600000;
    var completedHours = completedMs / 3600000;
    // kr/h endast från avslutade skift (pågående skift påverkar inte snittet)
    var krPerHour = completedHours >= (1 / 60) ? totalAmount / completedHours : 0;
    var remaining = Math.max(0, goal - totalAmount);

    var periodEnded = now >= to;
    var remShifts, neededPerShift;

    if (periodEnded) {
      remShifts = 0;
      neededPerShift = remaining;
    } else {
      remShifts = remainingShiftSlots(from, to, now);
      neededPerShift = remShifts > 0 ? remaining / remShifts : remaining;
    }

    // Prognos: inkört hittills + (kr/h × kvarvarande skift × 13 h)
    var prognosis = totalAmount + krPerHour * remShifts * 13;

    return {
      totalMs: totalMs,
      totalAmount: totalAmount,
      hours: hours,
      krPerHour: krPerHour,
      prognosis: prognosis,
      neededPerShift: neededPerShift,
      remaining: remaining,
      remShifts: remShifts,
      periodEnded: periodEnded,
      goal: goal
    };
  }

  // —— Week / month option lists ——
  function buildWeekOptions(selectEl, selectedRef, yearsBack, yearsForward) {
    var now = new Date();
    var y0 = getISOWeekYear(now) - (yearsBack || 2);
    var y1 = getISOWeekYear(now) + (yearsForward || 0);
    var selKey = getISOWeekYear(selectedRef) + "-W" + pad2(getISOWeek(selectedRef));
    var html = "";
    for (var y = y1; y >= y0; y--) {
      var maxW = weeksInISOYear(y);
      for (var w = maxW; w >= 1; w--) {
        var key = y + "-W" + pad2(w);
        var label = "v." + w + " " + formatYearShort(y);
        html += '<option value="' + key + '"' + (key === selKey ? " selected" : "") + ">" + label + "</option>";
      }
    }
    selectEl.innerHTML = html;
    selectEl.value = selKey;
  }

  function buildMonthOptions(selectEl, selectedRef, yearsBack, yearsForward) {
    var now = new Date();
    var y0 = now.getFullYear() - (yearsBack || 2);
    var y1 = now.getFullYear() + (yearsForward || 0);
    var selKey = selectedRef.getFullYear() + "-" + pad2(selectedRef.getMonth() + 1);
    var html = "";
    for (var y = y1; y >= y0; y--) {
      for (var m = 11; m >= 0; m--) {
        if (yearsForward === 0 && (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth()))) {
          continue;
        }
        var key = y + "-" + pad2(m + 1);
        var label = MONTHS_SHORT_SV[m] + " " + formatYearShort(y);
        html += '<option value="' + key + '"' + (key === selKey ? " selected" : "") + ">" + label + "</option>";
      }
    }
    selectEl.innerHTML = html;
    selectEl.value = selKey;
  }

  function parseWeekKey(key) {
    // "2026-W31"
    var m = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!m) return null;
    return dateFromISOWeek(parseInt(m[2], 10), parseInt(m[1], 10));
  }

  function parseMonthKey(key) {
    // "2026-07"
    var m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return null;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
  }

  function weekKeyFromDate(d) {
    return getISOWeekYear(d) + "-W" + pad2(getISOWeek(d));
  }

  function monthKeyFromDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  }

  function getUberReport(weekKey) {
    var list = state.uberReports || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].weekKey === weekKey) return list[i];
    }
    return null;
  }

  function uberBonusOf(report) {
    if (!report) return 0;
    return (Number(report.utmaning) || 0) + (Number(report.kampanjer) || 0);
  }

  function mondayFromWeekKey(weekKey) {
    var parts = /^(\d{4})-W(\d{2})$/.exec(weekKey);
    if (!parts) return null;
    var y = parseInt(parts[1], 10);
    var w = parseInt(parts[2], 10);
    // Jan 4 is always in ISO week 1
    var jan4 = new Date(y, 0, 4);
    var monday = startOfISOWeek(jan4);
    monday.setDate(monday.getDate() + (w - 1) * 7);
    return monday;
  }

  function sumUberReportsForMonth(year, monthIndex) {
    // Week counts toward the month of its end day (Sunday)
    var tips = 0;
    var bonus = 0;
    var totalIntakter = 0;
    var kundpris = 0;
    (state.uberReports || []).forEach(function (r) {
      if (!r || !r.weekKey) return;
      var monday = mondayFromWeekKey(r.weekKey);
      if (!monday) return;
      var sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      if (sunday.getFullYear() === year && sunday.getMonth() === monthIndex) {
        tips += Number(r.tips) || 0;
        bonus += uberBonusOf(r);
        totalIntakter += Number(r.totalIntakter) || 0;
        kundpris += Number(r.kundpris) || 0;
      }
    });
    return { tips: tips, bonus: bonus, totalIntakter: totalIntakter, kundpris: kundpris };
  }

  function sumUberGrossInRange(from, to) {
    var sum = 0;
    completedShifts().forEach(function (s) {
      var st = new Date(s.start);
      if (st >= from && st < to) sum += Number(s.uberGross) || 0;
    });
    return sum;
  }

  function shiftWeek(ref, delta) {
    var d = new Date(ref);
    d.setDate(d.getDate() + delta * 7);
    return startOfISOWeek(d);
  }

  function shiftMonth(ref, delta) {
    return new Date(ref.getFullYear(), ref.getMonth() + delta, 1);
  }

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, 2200);
  }

  function openModal(opts) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      modalMode = opts.mode || "confirm";
      editingId = opts.editingId || null;
      $("modalTitle").textContent = opts.title;
      $("modalBody").innerHTML = opts.bodyHtml || "";
      $("modalOk").textContent = opts.okText || "OK";
      $("modalOk").className = "ok" + (opts.okClass ? " " + opts.okClass : "");
      $("modalCancel").textContent = opts.cancelText || "Avbryt";
      $("modalBackdrop").classList.add("open");
      $("modalBackdrop").scrollTop = 0;
      setTimeout(function () {
        var first = $("modalBody").querySelector("input");
        if (first) first.focus();
      }, 40);
    });
  }

  function closeModal(result) {
    $("modalBackdrop").classList.remove("open");
    modalMode = null;
    editingId = null;
    var r = modalResolve;
    modalResolve = null;
    if (r) r(result);
  }

  function renderStatus() {
    if (isActive()) {
      $("mainActionBtn").textContent = "Avsluta skift";
      $("mainActionBtn").className = "btn-primary btn-logout";
    } else {
      $("mainActionBtn").textContent = "Starta skift";
      $("mainActionBtn").className = "btn-primary btn-login";
    }
  }

  function renderCurrentShift() {
    var box = $("currentShiftBox");
    var badge = $("shiftBadge");

    if (state.activeShift) {
      var start = state.activeShift.start;
      var activeObj = {
        start: start,
        end: null,
        breaks: state.activeShift.breaks || []
      };
      var elapsed = shiftDurationMs(activeObj);
      badge.textContent = "Pågår";
      badge.className = "badge";
      box.innerHTML =
        '<div class="shift-live">' +
        '<div class="stat-label">Starttid</div>' +
        '<div class="big-time">' + formatDateTime(start) + "</div>" +
        '<div class="stat-label" style="margin-top:10px">Pågått (exkl. rast)</div>' +
        '<div class="stat-value red" id="elapsedDisplay">' + formatHours(elapsed) + "</div>" +
        (breakDurationMs(activeObj) > 0
          ? '<div class="stat-label" style="margin-top:10px">Rast</div><div class="stat-value sm">' + formatHours(breakDurationMs(activeObj)) + "</div>"
          : "") +
        "</div>";
      return;
    }

    var done = completedShifts().slice().sort(function (a, b) {
      return new Date(b.end) - new Date(a.end);
    });

    if (done.length === 0) {
      badge.textContent = "Inget skift";
      badge.className = "badge idle";
      box.innerHTML = '<p class="empty-hint">Inga skift registrerade ännu.</p>';
      return;
    }

    var last = done[0];
    badge.textContent = "Senaste";
    badge.className = "badge idle";
    box.innerHTML =
      '<div class="stat-grid">' +
      '<div class="stat"><div class="stat-label">Start</div><div class="stat-value sm">' + formatDateTime(last.start) + "</div></div>" +
      '<div class="stat"><div class="stat-label">Slut</div><div class="stat-value sm">' + formatDateTime(last.end) + "</div></div>" +
      '<div class="stat"><div class="stat-label">Timmar</div><div class="stat-value sm">' + formatHours(shiftDurationMs(last)) + "</div></div>" +
      '<div class="stat"><div class="stat-label">Belopp</div><div class="stat-value sm green">' + formatMoney(last.amount) + "</div></div>" +
      "</div>";
  }

  function renderStatCells(stats) {
    var krH = stats.krPerHour > 0
      ? Math.round(stats.krPerHour).toLocaleString("sv-SE") + " kr"
      : "—";
    var needHtml;
    if (stats.remaining <= 0) {
      needHtml = "Mål uppnått!";
    } else if (stats.periodEnded) {
      needHtml =
        formatMoney(stats.remaining) +
        ' <span style="font-size:0.8rem;font-weight:500;color:var(--muted)">(period avslutad)</span>';
    } else {
      needHtml =
        formatMoney(Math.ceil(stats.neededPerShift)) +
        ' <span style="font-size:0.8rem;font-weight:500;color:var(--muted)">(~' +
        stats.remShifts +
        " skift kvar)</span>";
    }
    return (
      '<div class="stat"><div class="stat-label">Arbetade timmar</div><div class="stat-value sm">' + formatHoursDecimal(stats.totalMs) + "</div></div>" +
      '<div class="stat"><div class="stat-label">Totalt inkört</div><div class="stat-value sm green">' + formatMoney(stats.totalAmount) + "</div></div>" +
      '<div class="stat"><div class="stat-label">Kr per timme</div><div class="stat-value sm">' + krH + "</div></div>" +
      '<div class="stat"><div class="stat-label">Prognos</div><div class="stat-value sm accent">' + formatMoney(stats.prognosis) + "</div></div>" +
      '<div class="stat full"><div class="stat-label">Behövs per kvarvarande skift (för mål)</div>' +
      '<div class="stat-value sm ' + (stats.remaining <= 0 ? "green" : "warn") + '">' + needHtml + "</div></div>"
    );
  }

  function renderPeriodProgress(amount, goal, fillEl, labelEl, goalLabelEl) {
    var pct = goal > 0 ? Math.min(100, Math.round((amount / goal) * 100)) : 0;
    fillEl.style.width = pct + "%";
    fillEl.className = "progress-fill" + (amount >= goal ? " over" : "");
    labelEl.textContent = pct + "%";
    goalLabelEl.textContent = "Mål: " + formatMoney(goal);
  }

  function fillPeriodSelects() {
    buildWeekOptions($("histWeekSelect"), histWeekRef, 2, 0);
    buildMonthOptions($("histMonthSelect"), histMonthRef, 2, 0);
  }

  function renderDashboard() {
    var now = new Date();
    renderCurrentShift();
    fillPeriodSelects();
    updateHistoryPeriodChrome();

    var weekFrom = startOfISOWeek(now);
    var weekTo = endOfISOWeek(now);
    var weekNum = getISOWeek(now);
    $("weekTitle").textContent = "Vecka " + weekNum;
    var weekStats = computePeriodStats(weekFrom, weekTo, now, state.weekGoal, true);
    $("weekStats").innerHTML = renderStatCells(weekStats);
    renderPeriodProgress(
      weekStats.totalAmount,
      state.weekGoal,
      $("weekProgress"),
      $("weekProgressLabel"),
      $("weekGoalLabel")
    );

    var monthFrom = startOfMonth(now);
    var monthTo = endOfMonth(now);
    var m = now.getMonth();
    $("monthTitle").textContent = "Månad " + pad2(m + 1) + " (" + MONTHS_SHORT_SV[m] + ")";
    var monthStats = computePeriodStats(monthFrom, monthTo, now, state.monthGoal, false);
    $("monthStats").innerHTML = renderStatCells(monthStats);
    renderPeriodProgress(
      monthStats.totalAmount,
      state.monthGoal,
      $("monthProgress"),
      $("monthProgressLabel"),
      $("monthGoalLabel")
    );
  }

  function shiftsForDay(dateKey) {
    // Skift räknas alltid på startdatum (dygnsskifte 00:00)
    return state.shifts.filter(function (s) {
      return toDateKey(new Date(s.start)) === dateKey;
    }).sort(function (a, b) {
      return new Date(a.start) - new Date(b.start);
    });
  }

  function shiftDayKey(s) {
    return toDateKey(new Date(s.start));
  }

  function parseDateKey(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
    if (!m) return null;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }

  function shiftDateKey(dateKey, deltaDays) {
    var d = parseDateKey(dateKey) || new Date();
    d.setDate(d.getDate() + deltaDays);
    return toDateKey(d);
  }

  function collectHistoryItems(from, to, dayKey) {
    var items;
    if (dayKey) {
      items = shiftsForDay(dayKey).map(normalizeShift);
      if (state.activeShift) {
        var aKey = toDateKey(new Date(state.activeShift.start));
        if (aKey === dayKey) {
          var alreadyDay = items.some(function (s) { return s.id === state.activeShift.id; });
          if (!alreadyDay) {
            items.push(normalizeShift({
              id: state.activeShift.id,
              start: state.activeShift.start,
              end: null,
              amount: null,
              breaks: state.activeShift.breaks || [],
              _active: true
            }));
          }
        }
      }
    } else {
      items = shiftsStartingInRange(from, to).map(normalizeShift);
      if (state.activeShift) {
        var aStart = new Date(state.activeShift.start);
        if (aStart >= from && aStart < to) {
          var already = items.some(function (s) { return s.id === state.activeShift.id; });
          if (!already) {
            items.push(normalizeShift({
              id: state.activeShift.id,
              start: state.activeShift.start,
              end: null,
              amount: null,
              breaks: state.activeShift.breaks || [],
              _active: true
            }));
          }
        }
      }
    }
    items.sort(function (a, b) {
      return new Date(a.start) - new Date(b.start);
    });
    return items;
  }

  function krPerHourFrom(ms, amount) {
    var hours = ms / 3600000;
    if (hours < 1 / 60) return 0;
    return Math.round((Number(amount) || 0) / hours);
  }

  function renderDayReportCard(s) {
    var ms = shiftDurationMs(s);
    var breakMs = breakDurationMs(s);
    var amount = s._active ? 0 : (Number(s.amount) || 0);
    var krH = s._active ? 0 : krPerHourFrom(ms, amount);
    var krHStr = krH > 0 ? krH.toLocaleString("sv-SE") + " kr" : "—";
    var dateLabel = formatDateOnly(s.start);
    var badge = s._active ? '<span class="badge">Pågår</span>' : "";
    var attrs = s._active
      ? 'data-active="1" data-shift-id="' + s.id + '"'
      : 'data-shift-id="' + s.id + '"';

    return (
      '<button type="button" class="day-report-card" ' + attrs + ">" +
      '<div class="day-report-date"><span>' + dateLabel + "</span>" + badge + "</div>" +
      '<div class="history-summary-grid">' +
      '<div class="history-summary-stat">' +
      '<div class="stat-label">Arbetade timmar</div>' +
      '<div class="stat-value sm">' + formatHoursDecimal(ms) + "</div>" +
      "</div>" +
      '<div class="history-summary-stat">' +
      '<div class="stat-label">Rast totalt</div>' +
      '<div class="stat-value sm">' + (breakMs > 0 ? formatHoursDecimal(breakMs) : "0,0 h") + "</div>" +
      "</div>" +
      '<div class="history-summary-stat">' +
      '<div class="stat-label">Totalt inkört</div>' +
      '<div class="stat-value sm green">' + (s._active ? "—" : formatMoney(amount)) + "</div>" +
      "</div>" +
      '<div class="history-summary-stat">' +
      '<div class="stat-label">Inkört / timme</div>' +
      '<div class="stat-value sm">' + krHStr + "</div>" +
      "</div>" +
      "</div>" +
      (s._active
        ? '<div class="day-report-hint">Avsluta via Avsluta skift</div>'
        : '<div class="day-report-hint">Tryck för att redigera</div>') +
      "</button>"
    );
  }

  function formatClock(iso) {
    if (!iso) return "–";
    try {
      var d = new Date(iso);
      return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    } catch (e) {
      return "–";
    }
  }

  function formatWeekdayShort(d) {
    try {
      var s = d.toLocaleDateString("sv-SE", { weekday: "short" });
      return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
    } catch (e) {
      return "";
    }
  }

  function formatDayMonth(d) {
    return d.getDate() + "/" + (d.getMonth() + 1);
  }

  async function addManualShift() {
    var dayKey = $("historyDate").value || toDateKey(new Date());
    var result = await openModal({
      mode: "manualShift",
      title: "Lägg till skift",
      bodyHtml:
        '<div class="form-row">' +
        '<div class="field"><label for="manStartDate">Start datum</label>' +
        '<input type="text" id="manStartDate" inputmode="numeric" maxlength="10" value="' + dayKey + '" /></div>' +
        '<div class="field"><label for="manStartTime">Start tid (TTMM)</label>' +
        '<input type="text" id="manStartTime" inputmode="numeric" maxlength="4" placeholder="TTMM" /></div>' +
        "</div>" +
        '<div class="form-row">' +
        '<div class="field"><label for="manEndDate">Slut datum</label>' +
        '<input type="text" id="manEndDate" inputmode="numeric" maxlength="10" value="' + dayKey + '" /></div>' +
        '<div class="field"><label for="manEndTime">Slut tid (TTMM)</label>' +
        '<input type="text" id="manEndTime" inputmode="numeric" maxlength="4" placeholder="TTMM" /></div>' +
        "</div>" +
        '<div class="field"><label for="manAmount">Inkört (kr)</label>' +
        '<input type="number" id="manAmount" inputmode="numeric" min="0" step="1" /></div>' +
        '<div class="field"><label for="manUber">Varav Uber (brutto, kr)</label>' +
        '<input type="number" id="manUber" inputmode="numeric" min="0" step="1" placeholder="valfritt" /></div>' +
        '<div class="field"><label for="manTips">Dricks taxi (kr)</label>' +
        '<input type="number" id="manTips" inputmode="numeric" min="0" step="1" placeholder="valfritt" /></div>' +
        '<div class="field" style="margin-bottom:0"><label for="manKm">Körda km</label>' +
        '<input type="number" id="manKm" inputmode="numeric" min="0" step="1" placeholder="valfritt" /></div>',
      okText: "Spara",
      okClass: "green",
      cancelText: "Avbryt"
    });
    if (!result) return;
    state.shifts.push({
      id: uid(),
      start: result.start,
      end: result.end,
      amount: result.amount,
      uberGross: result.uberGross || 0,
      tips: result.tips || 0,
      bonus: 0,
      km: result.km,
      breaks: [],
      updatedAt: Date.now()
    });
    saveState();
    renderAll();
    toast("Skift tillagt");
  }

  function renderDayFooter(items, list) {
    if (!items || items.length === 0) {
      dayEditUnlocked = false;
      dayEditShiftId = null;
      list.innerHTML =
        '<div class="day-footer">' +
        '<p class="empty-hint" style="padding:8px 0">Inga skift denna dag.</p>' +
        '<button type="button" class="btn-secondary" id="addShiftBtn" style="width:100%">Lägg till skift</button>' +
        "</div>";
      var addBtn = $("addShiftBtn");
      if (addBtn) addBtn.addEventListener("click", addManualShift);
      return;
    }

    // Prefer completed shift; else active
    var primary = null;
    for (var i = 0; i < items.length; i++) {
      if (!items[i]._active) { primary = items[i]; break; }
    }
    if (!primary) primary = items[0];
    dayEditShiftId = primary.id;

    var unlockLabel = dayEditUnlocked ? "Lås rapport" : "Redigera rapport";

    var html = '<div class="day-footer">';

    if (!primary._active) {
      html +=
        '<button type="button" class="btn-secondary" id="toggleDayEditBtn" style="width:100%">' +
        unlockLabel +
        "</button>";
      if (dayEditUnlocked) {
        html +=
          '<p class="hint" style="margin-top:8px;text-align:center">Tryck på inkört, tider, dricks eller km.</p>' +
          '<button type="button" class="btn-secondary btn-danger" id="deleteDayShiftBtn" style="width:100%;margin-top:8px">Ta bort skift</button>';
      }
    } else {
      html += '<p class="hint" style="text-align:center">Avsluta skiftet via knappen Avsluta skift.</p>';
    }

    if (items.length > 1) {
      html += '<p class="hint" style="margin-top:8px;text-align:center">' + items.length + " skift denna dag – visar huvudsakligt skift.</p>";
    }

    html += "</div>";
    list.innerHTML = html;

    var toggleBtn = $("toggleDayEditBtn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        dayEditUnlocked = !dayEditUnlocked;
        renderHistory();
      });
    }
    var delBtn = $("deleteDayShiftBtn");
    if (delBtn) {
      delBtn.addEventListener("click", async function () {
        var ok = await openModal({
          mode: "confirm",
          title: "Ta bort skift?",
          bodyHtml: "<p>Skiftet raderas permanent.</p>",
          okText: "Ta bort",
          okClass: "danger",
          cancelText: "Avbryt"
        });
        if (!ok) return;
        state.shifts = state.shifts.filter(function (s) { return s.id !== primary.id; });
        queueCloudShift(primary.id);
        dayEditUnlocked = false;
        dayEditShiftId = null;
        saveState();
        renderAll();
        toast("Skift borttaget");
      });
    }
  }

  function renderHistoryList(items) {
    var list = $("historyList");

    // Dagläge: tider + redigera
    if (historyMode === "day") {
      if (!items || items.length === 0) {
        renderDayFooter([], list);
      } else {
        renderDayFooter(items, list);
      }
      return;
    }

    var html = "";
    if (!items || items.length === 0) {
      html += '<p class="empty-hint">Inga skift denna period.</p>';
    } else {
      var byDay = {};
      items.forEach(function (s) {
        var key = shiftDayKey(s);
        if (!byDay[key]) {
          byDay[key] = { key: key, amount: 0, ms: 0, hasActive: false, count: 0 };
        }
        byDay[key].count++;
        if (s._active) {
          byDay[key].hasActive = true;
          byDay[key].ms += shiftDurationMs(s);
        } else {
          byDay[key].amount += Number(s.amount) || 0;
          byDay[key].ms += shiftDurationMs(s);
        }
      });

      var dayKeys = Object.keys(byDay).sort();
      var todayKey = toDateKey(new Date());

      html += dayKeys.map(function (key) {
        var d = byDay[key];
        var label = formatCompactDateKey(key);
        try {
          var dt = new Date(key + "T12:00:00");
          var wd = dt.toLocaleDateString("sv-SE", { weekday: "short" });
          label = wd.charAt(0).toUpperCase() + wd.slice(1) + " " + label;
        } catch (e) {}

        var amountStr = d.hasActive && d.amount === 0 ? "—" : formatMoney(d.amount);
        var hoursStr = formatHours(d.ms);
        var isToday = key === todayKey;
        var cls = "day-row" + (isToday ? " is-today" : "");

        return (
          '<button type="button" class="' + cls + '" data-day-key="' + key + '">' +
          '<span class="day-row-date">' + label + (d.hasActive ? ' · pågår' : '') + '</span>' +
          '<span class="day-row-amount">' + amountStr + '</span>' +
          '<span class="day-row-hours">' + hoursStr + '</span>' +
          '</button>'
        );
      }).join("");
    }

    // Uber report controls (week only)
    if (historyMode === "week") {
      var weekFrom = startOfISOWeek(histWeekRef);
      var weekKey = weekKeyFromDate(weekFrom);
      var rep = getUberReport(weekKey);
      var punched = sumUberGrossInRange(weekFrom, endOfISOWeek(histWeekRef));
      html += '<div class="day-footer" style="margin-top:12px">';
      if (rep) {
        var bonus = uberBonusOf(rep);
        var diff = (Number(rep.kundpris) || 0) - punched;
        html +=
          '<div class="kv-row" style="border:none;padding:4px 0"><span class="kv-pair-left">Uber-rapport</span><span class="kv-pair-right">sparad</span></div>' +
          '<div class="kv-row" style="border:none;padding:2px 0"><span class="kv-pair-left">Inslaget brutto</span><span class="kv-pair-right">' + formatMoney(Math.round(punched)) + '</span></div>' +
          '<div class="kv-row" style="border:none;padding:2px 0"><span class="kv-pair-left">Totalt kundpris</span><span class="kv-pair-right">' + formatMoney(Math.round(Number(rep.kundpris) || 0)) + '</span></div>' +
          '<div class="kv-row" style="border:none;padding:2px 0"><span class="kv-pair-left">Differens</span><span class="kv-pair-right">' + (diff >= 0 ? "+" : "") + formatMoney(Math.round(diff)) + '</span></div>' +
          '<div class="kv-row" style="border:none;padding:2px 0"><span class="kv-pair-left">Uber-bonus</span><span class="kv-pair-right">' + formatMoney(Math.round(bonus)) + '</span></div>' +
          '<div class="kv-row" style="border:none;padding:2px 0"><span class="kv-pair-left">Uber-dricks</span><span class="kv-pair-right">' + formatMoney(Math.round(Number(rep.tips) || 0)) + '</span></div>' +
          '<div class="kv-row" style="border:none;padding:2px 0"><span class="kv-pair-left">Dina totala</span><span class="kv-pair-right">' + formatMoney(Math.round(Number(rep.totalIntakter) || 0)) + '</span></div>' +
          '<button type="button" class="btn-secondary" id="uberReportBtn" style="width:100%;margin-top:10px">Redigera Uber-rapport</button>';
      } else {
        html +=
          '<p class="hint" style="text-align:center;margin:0 0 8px">Ingen Uber-rapport för denna vecka.</p>' +
          '<button type="button" class="btn-secondary" id="uberReportBtn" style="width:100%">Lägg till Uber-rapport</button>';
      }
      html +=
        '<button type="button" class="btn-primary" id="openReportCardBtn" style="width:100%;margin-top:10px">Visa rapportkort</button>';
      html += "</div>";
    }

    if (historyMode === "month") {
      html +=
        '<div class="day-footer" style="margin-top:12px">' +
        '<button type="button" class="btn-primary" id="openReportCardBtn" style="width:100%">Visa rapportkort</button>' +
        "</div>";
    }

    list.innerHTML = html;

    var uberBtn = $("uberReportBtn");
    if (uberBtn) {
      uberBtn.addEventListener("click", openUberReportEditor);
    }
    var reportBtn = $("openReportCardBtn");
    if (reportBtn) {
      reportBtn.addEventListener("click", openReportCard);
    }
  }

  function collectDailyInkort(from, to) {
    var days = [];
    var cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    var end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (cur < end) {
      var key = toDateKey(cur);
      days.push({ key: key, date: new Date(cur), amount: 0, label: formatDayMonth(cur) });
      cur.setDate(cur.getDate() + 1);
    }
    completedShifts().forEach(function (s) {
      var st = new Date(s.start);
      if (st < from || st >= to) return;
      var key = toDateKey(st);
      for (var i = 0; i < days.length; i++) {
        if (days[i].key === key) {
          days[i].amount += adjustedInkort(s);
          break;
        }
      }
    });
    return days;
  }

  function drawReportBars(canvas, days, goal, opts) {
    if (!canvas) return;
    opts = opts || {};
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 480;
    var cssH = 230;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = cssW;
    var h = cssH;
    var padL = 36;
    var padR = 12;
    var padT = 28;
    var padB = 28;
    var chartW = w - padL - padR;
    var chartH = h - padT - padB;
    var n = days.length || 1;
    var isMonth = !!opts.isMonth;
    var periodDone = !!opts.periodDone;
    var prognos = Number(opts.prognos) || 0;

    var cum = 0;
    var cumValues = days.map(function (d) {
      cum += d.amount;
      return cum;
    });
    var maxCum = 0;
    cumValues.forEach(function (v) { if (v > maxCum) maxCum = v; });
    var currentCum = maxCum;
    for (var ci = cumValues.length - 1; ci >= 0; ci--) {
      if (days[ci].amount > 0 || cumValues[ci] > 0) {
        currentCum = cumValues[ci];
        break;
      }
    }
    var endLineVal = periodDone ? currentCum : (prognos > 0 ? prognos : currentCum);
    var maxVal = Math.max(goal || 0, maxCum, endLineVal, 1) * 1.1;

    function yFor(v) {
      return padT + chartH - (v / maxVal) * chartH;
    }

    ctx.clearRect(0, 0, w, h);

    // Y-axis grid — 5k week, 25k month
    var yStep = isMonth ? 25000 : 5000;
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (var mark = yStep; mark < maxVal; mark += yStep) {
      var my = yFor(mark);
      ctx.strokeStyle = "rgba(120, 120, 130, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, my);
      ctx.lineTo(padL + chartW, my);
      ctx.stroke();
      ctx.fillStyle = "rgba(160, 160, 170, 0.85)";
      ctx.fillText(Math.round(mark / 1000) + "k", padL - 4, my);
    }

    // Thin bars centered on full-width day slots
    var slotW = chartW / n;
    var barW = n <= 7 ? Math.min(14, slotW * 0.45) : n <= 14 ? Math.min(10, slotW * 0.55) : Math.min(7, slotW * 0.65);
    barW = Math.max(4, barW);
    var pacePerDay = goal > 0 ? goal / n : 0;

    function slotCenterX(i) {
      return padL + (i + 0.5) * slotW;
    }

    days.forEach(function (d, i) {
      var daily = d.amount;
      if (daily <= 0) return;
      var cumulative = cumValues[i];
      var x = slotCenterX(i) - barW / 2;
      var bh = (cumulative / maxVal) * chartH;
      var y = padT + chartH - bh;
      var above = daily >= pacePerDay - 0.01;
      ctx.fillStyle = above ? "rgba(48, 164, 108, 0.88)" : "rgba(229, 72, 77, 0.82)";
      ctx.fillRect(x, y, barW, Math.max(bh, 2));
    });

    var showVal = periodDone ? currentCum : (prognos > 0 ? prognos : currentCum);
    var aboveGoal = showVal >= (goal || 0) - 0.01;
    var accent = aboveGoal ? "rgba(48, 164, 108, 0.95)" : "rgba(229, 72, 77, 0.95)";
    var accentSolid = aboveGoal ? "rgba(48, 164, 108, 1)" : "rgba(229, 72, 77, 1)";

    // Diagonal goal pace (0,0) → (n, goal) — neutral
    if (goal > 0) {
      ctx.strokeStyle = "rgba(220, 220, 230, 0.95)";
      ctx.lineWidth = 2.25;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, yFor(0));
      ctx.lineTo(padL + chartW, yFor(goal));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Diagonal prognos/result in green/red
    if (endLineVal > 0 && Math.abs(endLineVal - (goal || 0)) > 1) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, yFor(0));
      ctx.lineTo(padL + chartW, yFor(endLineVal));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Horizontal goal line (neutral)
    if (goal > 0) {
      var gy = yFor(goal);
      ctx.strokeStyle = "rgba(230, 230, 240, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + chartW, gy);
      ctx.stroke();
      ctx.fillStyle = "rgba(230, 230, 240, 0.95)";
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Mål: " + Math.round(goal).toLocaleString("sv-SE") + " kr", padL + 3, gy - 7);
    }

    // Horizontal Resultat (done) or Prognos (open) — green/red
    if (showVal > 0) {
      var hy = yFor(showVal);
      var hLabel = periodDone ? "Resultat" : "Prognos";
      var diff = Math.round(showVal - (goal || 0));
      var diffStr = (diff >= 0 ? "+" : "") + diff.toLocaleString("sv-SE") + " kr";
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padL, hy);
      ctx.lineTo(padL + chartW, hy);
      ctx.stroke();
      ctx.fillStyle = accentSolid;
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        hLabel + ": " + Math.round(showVal).toLocaleString("sv-SE") + " kr (" + diffStr + ")",
        padL + 3,
        hy - 7
      );
    }

    // X labels on full-width slots
    ctx.fillStyle = "rgba(160, 160, 170, 0.9)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    var step = n > 16 ? 5 : n > 10 ? 2 : 1;
    for (var i = 0; i < n; i += step) {
      ctx.fillText(days[i].label, slotCenterX(i), h - 8);
    }
  }

  function buildBreakdownBars(segments) {
    var max = 0;
    var sum = 0;
    segments.forEach(function (s) {
      if (s.value > max) max = s.value;
      sum += Math.max(0, s.value);
    });
    if (max < 1) max = 1;
    if (sum < 1) sum = 1;
    return (
      '<div class="report-breakdown">' +
      segments.map(function (s) {
        var barPct = Math.max(0, Math.min(100, (s.value / max) * 100));
        var sharePct = Math.round((Math.max(0, s.value) / sum) * 100);
        return (
          '<div class="report-break-row">' +
          '<div class="report-break-top">' +
          '<span><i class="report-dot" style="background:' + s.color + '"></i>' +
          s.label + " (" + sharePct + "%)</span>" +
          "<strong>" + formatMoney(Math.round(s.value)) + "</strong>" +
          "</div>" +
          '<div class="report-break-track">' +
          '<div class="report-break-fill" style="width:' + barPct + "%;background:" + s.color + '"></div>' +
          "</div>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function openReportCard() {
    var from, to, goal, title;
    var now = new Date();
    if (historyMode === "week") {
      from = startOfISOWeek(histWeekRef);
      to = endOfISOWeek(histWeekRef);
      goal = state.weekGoal;
      title = "Vecka " + getISOWeek(from) + " · " + getISOWeekYear(from);
    } else if (historyMode === "month") {
      from = startOfMonth(histMonthRef);
      to = endOfMonth(histMonthRef);
      goal = state.monthGoal;
      title = MONTHS_SV[from.getMonth()] + " " + from.getFullYear();
    } else {
      return;
    }

    var days = collectDailyInkort(from, to);
    var totalAdj = 0;
    var totalRaw = 0;
    var totalUber = 0;
    var totalTaxiTips = 0;
    var totalMs = 0;
    var totalKm = 0;
    var shiftCount = 0;
    completedShifts().forEach(function (s) {
      var st = new Date(s.start);
      if (st < from || st >= to) return;
      totalAdj += adjustedInkort(s);
      totalRaw += Number(s.amount) || 0;
      totalUber += Number(s.uberGross) || 0;
      totalTaxiTips += Number(s.tips) || 0;
      totalMs += shiftDurationMs(s);
      var km = shiftKm(s);
      if (km != null) totalKm += km;
      shiftCount++;
    });

    var uberTips = 0;
    var uberBonus = 0;
    var uberPayout = 0;
    if (historyMode === "week") {
      var urep = getUberReport(weekKeyFromDate(from));
      if (urep) {
        uberTips = Number(urep.tips) || 0;
        uberBonus = uberBonusOf(urep);
        uberPayout = Number(urep.totalIntakter) || 0;
      }
    } else {
      var um = sumUberReportsForMonth(from.getFullYear(), from.getMonth());
      uberTips = um.tips;
      uberBonus = um.bonus;
      uberPayout = um.totalIntakter;
    }

    var vanliga = Math.max(0, totalRaw - totalUber);
    var uberNet = totalUber * 0.74;
    var tipsAll = totalTaxiTips + uberTips;

    $("reportTitle").textContent = title;

    var periodDone = now >= to;
    var remShifts = periodDone ? 0 : remainingShiftSlots(from, to, now);
    var krPerShiftReport = shiftCount > 0 ? totalAdj / shiftCount : 0;
    var reportPrognos = periodDone
      ? totalAdj
      : (shiftCount > 0 && remShifts > 0
          ? totalAdj + krPerShiftReport * remShifts
          : totalAdj);

    lastReportExportMeta = {
      periodDone: periodDone,
      isWeek: historyMode === "week",
      weekNum: getISOWeek(from),
      monthShort: MONTHS_SHORT_SV[from.getMonth()],
      dateSuffix: pad2(now.getMonth() + 1) + pad2(now.getDate())
    };

    drawReportBars($("reportBarCanvas"), days, goal, {
      isMonth: historyMode === "month",
      periodDone: periodDone,
      prognos: reportPrognos
    });

    var segments = [
      { label: "Vanliga", value: vanliga, color: "#4c8bf5" },
      { label: "Uber netto", value: uberNet, color: "#6b7280" },
      { label: "Dricks", value: tipsAll, color: "#30a46c" },
      { label: "Uber-bonus", value: uberBonus, color: "#f5a524" }
    ];
    $("reportPieWrap").innerHTML = buildBreakdownBars(segments);

    var hours = totalMs / 3600000;
    var krH = hours >= 1 / 60 && totalAdj > 0 ? totalAdj / hours : 0;
    var krShift = shiftCount > 0 ? totalAdj / shiftCount : 0;
    var mil = totalKm / 10;
    var krMil = mil > 0 && totalAdj > 0 ? totalAdj / mil : 0;
    var dricks = tipsAll + uberBonus;

    var showValStats = periodDone ? totalAdj : reportPrognos;
    var statsDiff = Math.round(showValStats - goal);
    var statsLabel = periodDone ? "Resultat" : "Prognos";
    var statsColor = showValStats >= goal ? "var(--green)" : "var(--red)";

    $("reportStats").innerHTML =
      '<div class="kv-row"><span class="kv-pair-left">Totalt inkört</span><span class="kv-pair-right kv-money">' + formatMoney(Math.round(totalAdj)) + "</span></div>" +
      '<div class="kv-row"><span class="kv-pair-left">Dricks + bonus</span><span class="kv-pair-right">' + formatMoney(Math.round(dricks)) + "</span></div>" +
      '<div class="kv-row"><span class="kv-pair-left">Mål</span><span class="kv-pair-right">' + formatMoney(goal) + "</span></div>" +
      '<div class="kv-row"><span class="kv-pair-left">' + statsLabel + '</span><span class="kv-pair-right" style="color:' + statsColor + '">' +
      formatMoney(Math.round(showValStats)) + " (" + (statsDiff >= 0 ? "+" : "-") + Math.abs(statsDiff).toLocaleString("sv-SE") + " kr)</span></div>" +
      '<div class="kv-row"><span class="kv-pair-left">' + fmtNum(hours, 1) + " h</span><span class=\"kv-pair-right\">" + Math.round(krH).toLocaleString("sv-SE") + " kr/timme</span></div>" +
      '<div class="kv-row"><span class="kv-pair-left">' + fmtNum(totalKm, 0) + " km</span><span class=\"kv-pair-right\">" + fmtNum(krMil, 1) + " kr/mil</span></div>" +
      '<div class="kv-row"><span class="kv-pair-left">' + shiftCount + " skift</span><span class=\"kv-pair-right\">" + Math.round(krShift).toLocaleString("sv-SE") + " kr/skift</span></div>" +
      (uberPayout > 0
        ? '<div class="kv-row"><span class="kv-pair-left">Uber-utbetalning</span><span class="kv-pair-right">' + formatMoney(Math.round(uberPayout)) + "</span></div>"
        : "");

    $("reportOverlay").classList.add("open");
  }

  function closeReportCard() {
    $("reportOverlay").classList.remove("open");
  }

  var lastReportExportMeta = null;

  function buildReportExportBaseName() {
    var m = lastReportExportMeta;
    if (!m) return "TaxiKit-rapport";
    var prefix = m.periodDone ? "ResultatRapport" : "PrognosRapport";
    var body;
    if (m.isWeek) {
      body = "W" + m.weekNum;
    } else {
      body = m.monthShort || "Manad";
    }
    if (!m.periodDone) {
      body += m.dateSuffix || "";
    }
    return prefix + body;
  }

  function exportReportPdf() {
    var name = buildReportExportBaseName();
    var prevTitle = document.title;
    document.title = name;
    // Give the browser a tick to pick up the title for "Save as PDF"
    setTimeout(function () {
      window.print();
      setTimeout(function () {
        document.title = prevTitle;
      }, 1000);
    }, 50);
  }

  function loadHtml2Canvas() {
    return new Promise(function (resolve, reject) {
      if (window.html2canvas) {
        resolve(window.html2canvas);
        return;
      }
      if (!navigator.onLine) {
        reject(new Error("offline"));
        return;
      }
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = function () {
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error("load"));
      };
      s.onerror = function () { reject(new Error("load")); };
      document.head.appendChild(s);
    });
  }

  async function exportReportImage() {
    var card = $("reportCard");
    if (!card) return;
    var actions = card.querySelector(".report-actions");
    var closeBtn = $("reportCloseBtn");
    if (actions) actions.style.display = "none";
    if (closeBtn) closeBtn.style.display = "none";
    try {
      toast("Skapar bild…");
      var html2canvas = await loadHtml2Canvas();
      var canvas = await html2canvas(card, {
        backgroundColor: "#0b0b0f",
        scale: 2,
        useCORS: true,
        logging: false
      });
      var name = buildReportExportBaseName() + ".png";
      var link = document.createElement("a");
      link.download = name;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast("Bild sparad");
    } catch (err) {
      if (err && err.message === "offline") {
        toast("Bild-export behöver nätverk första gången. Prova PDF offline.");
      } else {
        toast("Kunde inte skapa bild. Prova PDF.");
      }
    } finally {
      if (actions) actions.style.display = "";
      if (closeBtn) closeBtn.style.display = "";
    }
  }

  async function openUberReportEditor() {
    var weekFrom = startOfISOWeek(histWeekRef);
    var weekKey = weekKeyFromDate(weekFrom);
    var existing = getUberReport(weekKey) || {};
    var punched = sumUberGrossInRange(weekFrom, endOfISOWeek(histWeekRef));

    var result = await openModal({
      mode: "uberReport",
      title: "Uber-rapport · " + weekKey,
      bodyHtml:
        '<p class="hint" style="margin-top:0">Inslaget brutto: <strong>' +
        formatMoney(Math.round(punched)) +
        "</strong></p>" +
        '<div class="field"><label for="uberKundpris">Totalt kundpris (kr)</label>' +
        '<input type="number" id="uberKundpris" inputmode="decimal" step="0.01" value="' +
        (existing.kundpris != null ? existing.kundpris : "") +
        '" placeholder="t.ex. 4105.99" /></div>' +
        '<div class="field"><label for="uberKampanjer">Kundkampanjer (kr)</label>' +
        '<input type="number" id="uberKampanjer" inputmode="decimal" step="0.01" value="' +
        (existing.kampanjer != null ? existing.kampanjer : "") +
        '" placeholder="0" /></div>' +
        '<div class="field"><label for="uberUtmaning">Utmaning (kr)</label>' +
        '<input type="number" id="uberUtmaning" inputmode="decimal" step="0.01" value="' +
        (existing.utmaning != null ? existing.utmaning : "") +
        '" placeholder="0" /></div>' +
        '<div class="field"><label for="uberTips">Dricks (kr)</label>' +
        '<input type="number" id="uberTips" inputmode="decimal" step="0.01" value="' +
        (existing.tips != null ? existing.tips : "") +
        '" placeholder="0" /></div>' +
        '<div class="field" style="margin-bottom:0"><label for="uberTotal">Dina totala / utbetalning (kr)</label>' +
        '<input type="number" id="uberTotal" inputmode="decimal" step="0.01" value="' +
        (existing.totalIntakter != null ? existing.totalIntakter : "") +
        '" placeholder="t.ex. 3283.51" /></div>' +
        '<p class="hint">Bonus i sammanfattningen = kundkampanjer + utmaning.</p>',
      okText: "Spara",
      okClass: "green",
      cancelText: "Avbryt"
    });
    if (!result) return;

    var list = state.uberReports || [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].weekKey === weekKey) { idx = i; break; }
    }
    var entry = {
      id: existing.id || uid(),
      weekKey: weekKey,
      kundpris: result.kundpris,
      utmaning: result.utmaning,
      kampanjer: result.kampanjer,
      tips: result.tips,
      totalIntakter: result.totalIntakter,
      updatedAt: Date.now()
    };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    state.uberReports = list;
    state._metaUpdatedAt = Date.now();
    saveState();
    renderHistory();
    toast("Uber-rapport sparad");
  }

  var MAX_HOURS_PER_DAY = 13;
  var MAX_SHIFTS_PER_DAY = 1;

  function formatHoursPair(workedMs, maxHours) {
    var worked = workedMs / 3600000;
    var workedStr = worked.toLocaleString("sv-SE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
    var maxStr = maxHours.toLocaleString("sv-SE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return workedStr + " / " + maxStr + " h";
  }

  /** Unika arbetsdagar utifrån startdatum. */
  function countWorkedDays(items) {
    var days = {};
    items.forEach(function (s) {
      days[shiftDayKey(s)] = true;
    });
    return Object.keys(days).length;
  }

  function updateHistoryPeriodChrome() {
    var calendarToday = toDateKey(new Date());
    var todayKey = effectiveTodayKey();
    var dayInput = $("historyDate");
    if (!dayInput) return;
    var dayKey = dayInput.value || todayKey;
    var isToday = dayKey === todayKey;

    var dayLabel = $("historyDateLabel");
    if (dayLabel) dayLabel.textContent = formatCompactDateKey(dayKey);

    var dayWrap = $("historyDateWrap");
    if (dayWrap) dayWrap.classList.toggle("is-current", isToday);

    var dayBtn = $("historyTodayBtn");
    if (dayBtn) dayBtn.classList.toggle("is-here", isToday);
    var dayNext = $("histDayNext");
    // Don't advance past calendar today; while active night shift, "current" is start day
    if (dayNext) dayNext.disabled = dayKey >= calendarToday || isToday;

    var weekNow = weekKeyFromDate(new Date()) === weekKeyFromDate(histWeekRef);
    var weekSel = $("histWeekSelect");
    var weekBtn = $("histWeekNowBtn");
    if (weekSel) weekSel.classList.toggle("is-current", weekNow);
    if (weekBtn) weekBtn.classList.toggle("is-here", weekNow);
    var weekNext = $("histWeekNext");
    if (weekNext) weekNext.disabled = weekNow || weekKeyFromDate(histWeekRef) > weekKeyFromDate(new Date());

    var monthNow = monthKeyFromDate(new Date()) === monthKeyFromDate(histMonthRef);
    var monthSel = $("histMonthSelect");
    var monthBtn = $("histMonthNowBtn");
    if (monthSel) monthSel.classList.toggle("is-current", monthNow);
    if (monthBtn) monthBtn.classList.toggle("is-here", monthNow);
    var monthNext = $("histMonthNext");
    if (monthNext) monthNext.disabled = monthNow || monthKeyFromDate(histMonthRef) > monthKeyFromDate(new Date());
  }

  function renderHistorySummary(items, period) {
    // Replaced by the compact skiftSummary at the top – always hide the old block
    var box = $("historySummary");
    if (box) {
      box.classList.remove("open");
      box.style.display = "none";
      box.innerHTML = "";
    }
    return;

    var completed = items.filter(function (s) { return !s._active && s.end; });
    var hasActive = items.some(function (s) { return s._active; });

    if (completed.length === 0 && items.length === 0) {
      box.classList.remove("open");
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }

    var total = 0;
    var ms = 0;
    completed.forEach(function (s) {
      total += Number(s.amount) || 0;
      ms += shiftDurationMs(s);
    });
    items.forEach(function (s) {
      if (s._active) ms += shiftDurationMs(s);
    });

    box.classList.add("open");
    box.style.display = "flex";

    // Dagläge: dölj kompakt sammanfattning – varje skift har egen rapport
    if (!period || period.mode === "day") {
      box.classList.remove("open");
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }

    var days = period.mode === "week" ? 7 : daysInMonth(period.from);
    var maxHours = days * MAX_HOURS_PER_DAY;
    var maxShifts = days * MAX_SHIFTS_PER_DAY;
    var workedShifts = countWorkedDays(items);
    var hoursW = ms / 3600000;
    var krPerHour = hoursW >= (1 / 60) ? Math.round(total / hoursW) : 0;
    var krHStr2 = krPerHour > 0
      ? krPerHour.toLocaleString("sv-SE") + " kr"
      : "—";

    // Ordning: timmar | skift · totalt | kr/h
    box.innerHTML =
      '<div class="history-summary-grid">' +
      '<div class="history-summary-stat">' +
      '<div class="stat-label">Arbetade timmar</div>' +
      '<div class="stat-value sm">' + formatHoursPair(ms, maxHours) + "</div>" +
      "</div>" +
      '<div class="history-summary-stat">' +
      '<div class="stat-label">Arbetade skift</div>' +
      '<div class="stat-value sm">' + workedShifts + " / " + maxShifts + " skift</div>" +
      "</div>" +
      '<div class="history-summary-stat">' +
      '<div class="stat-label">Totalt inkört</div>' +
      '<div class="stat-value sm green">' + formatMoney(total) + "</div>" +
      "</div>" +
      '<div class="history-summary-stat">' +
      '<div class="stat-label">Inkört / timme</div>' +
      '<div class="stat-value sm">' + krHStr2 + "</div>" +
      "</div>" +
      "</div>";
  }

  function setHistoryMode(mode) {
    historyMode = mode;
    if (mode !== "day") {
      dayEditUnlocked = false;
      dayEditShiftId = null;
    }
    document.querySelectorAll(".mode-pill").forEach(function (p) {
      p.classList.toggle("active", p.dataset.mode === mode);
    });
    $("historyDayPicker").style.display = mode === "day" ? "flex" : "none";
    $("historyWeekPicker").style.display = mode === "week" ? "flex" : "none";
    $("historyMonthPicker").style.display = mode === "month" ? "flex" : "none";
    renderHistory();
  }

  function renderHistory() {
    var input = $("historyDate");
    if (!input.value) input.value = effectiveTodayKey();
    // If viewing calendar "today" but an active shift started yesterday, stay on that day
    if (state.activeShift && state.activeShift.start) {
      var activeKey = toDateKey(new Date(state.activeShift.start));
      var calToday = toDateKey(new Date());
      if (input.value === calToday && activeKey !== calToday) {
        input.value = activeKey;
      }
    }
    fillPeriodSelects();
    updateHistoryPeriodChrome();

    var items;
    var period = { mode: historyMode, from: null, to: null };
    var now = new Date();

    if (historyMode === "day") {
      items = collectHistoryItems(null, null, input.value);
      period.from = null;
    } else if (historyMode === "week") {
      period.from = startOfISOWeek(histWeekRef);
      period.to = endOfISOWeek(histWeekRef);
      items = collectHistoryItems(period.from, period.to, null);
    } else {
      period.from = startOfMonth(histMonthRef);
      period.to = endOfMonth(histMonthRef);
      items = collectHistoryItems(period.from, period.to, null);
    }

    renderSkiftSummary(items, period, now);
    renderHistorySummary(items, period);
    renderHistoryList(items);
  }

  function adjustedInkort(s) {
    var amount = Number(s.amount) || 0;
    var uber = Number(s.uberGross) || 0;
    if (uber > amount) uber = amount;
    return amount - uber * 0.26;
  }

  function shiftKm(s) {
    if (s.km != null && Number.isFinite(Number(s.km)) && Number(s.km) >= 0) {
      return Number(s.km);
    }
    // Legacy fallback
    if (s.odoStart != null && s.odoEnd != null) {
      var a = Number(s.odoStart);
      var b = Number(s.odoEnd);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) return b - a;
    }
    return null;
  }

  function fmtNum(n, decimals) {
    return n.toLocaleString("sv-SE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function renderSkiftSummary(items, period, now) {
    var box = $("skiftStats");
    if (!box) return;

    var completed = items.filter(function (s) { return !s._active && s.end; });
    var hasActive = items.some(function (s) { return s._active; });
    var totalAmount = 0;
    var totalTipsBonus = 0;
    var totalUberGross = 0;
    var completedMs = 0;
    var activeMs = 0;
    var totalKm = 0;
    var hasKm = false;

    completed.forEach(function (s) {
      totalAmount += adjustedInkort(s);
      totalTipsBonus += Number(s.tips) || 0; // only taxi tips (non-Uber)
      totalUberGross += Number(s.uberGross) || 0;
      completedMs += shiftDurationMs(s);
      var km = shiftKm(s);
      if (km != null) {
        totalKm += km;
        hasKm = true;
      }
    });
    var uberTips = 0;
    var uberBonus = 0;
    var uberTotalIntakter = 0;
    if (historyMode === "week" && period.from) {
      var wk = weekKeyFromDate(period.from);
      var urep = getUberReport(wk);
      if (urep) {
        uberTips = Number(urep.tips) || 0;
        uberBonus = uberBonusOf(urep);
        uberTotalIntakter = Number(urep.totalIntakter) || 0;
      }
    } else if (historyMode === "month" && period.from) {
      var um = sumUberReportsForMonth(period.from.getFullYear(), period.from.getMonth());
      uberTips = um.tips;
      uberBonus = um.bonus;
      uberTotalIntakter = um.totalIntakter;
    }
    var uberTipsBonus = uberTips + uberBonus;
    items.forEach(function (s) {
      if (s._active) activeMs += shiftDurationMs(s);
    });

    // Rates only from completed shifts (ongoing shift has hours but no money yet)
    var hoursCompleted = completedMs / 3600000;
    var hoursActive = activeMs / 3600000;
    var krPerHour = hoursCompleted >= (1 / 60) && totalAmount > 0 ? totalAmount / hoursCompleted : 0;
    var krPerShift = completed.length > 0 ? totalAmount / completed.length : 0;
    // 1 mil = 10 km
    var mil = totalKm / 10;
    var krPerMil = hasKm && mil > 0 ? totalAmount / mil : 0;

    // On active-only day, money stays 0 until shift is finished
    var moneyReady = !(historyMode === "day" && completed.length === 0 && hasActive);
    var displayAmount = moneyReady ? totalAmount : 0;
    var displayTipsBonus = moneyReady ? totalTipsBonus : 0;
    var displayUberGross = moneyReady ? totalUberGross : 0;
    var displayKrPerHour = moneyReady && hoursCompleted >= (1 / 60) && displayAmount > 0
      ? displayAmount / hoursCompleted
      : 0;
    var displayKrPerShift = moneyReady && completed.length > 0 ? displayAmount / completed.length : 0;
    var displayKm = hasKm ? totalKm : 0;
    var displayMil = displayKm / 10;
    var displayKrPerMil = displayMil > 0 && displayAmount > 0 ? displayAmount / displayMil : 0;

    var canEditFields = historyMode === "day" && dayEditUnlocked && dayEditShiftId;

    function pairRow(left, right, extraClass, editField) {
      var editable = canEditFields && editField;
      var cls = "kv-row" + (extraClass ? " " + extraClass : "") + (editable ? " kv-editable" : "");
      var attrs = editable ? ' role="button" tabindex="0" data-edit-field="' + editField + '"' : "";
      return (
        '<div class="' + cls + '"' + attrs + ">" +
        '<span class="kv-pair-left">' + left + "</span>" +
        '<span class="kv-pair-right">' + right + "</span>" +
        "</div>"
      );
    }

    var html = "";
    var primary = completed[0] || items.filter(function (s) { return s._active; })[0] || null;

    // Row 1 header: "19:54 – pågår" | "Mån 10/8 – Sön 16/8" | "Lör 1/8 – Mån 31/8"
    var periodHeader = "";
    var periodEditable = null;
    if (historyMode === "day") {
      if (primary) {
        var startClock = formatClock(primary.start);
        periodHeader = primary._active
          ? startClock + " – pågår"
          : startClock + " – " + formatClock(primary.end);
        if (!primary._active) periodEditable = "times";
      } else {
        periodHeader = "—";
      }
    } else if (historyMode === "week" && period.from && period.to) {
      var weekEnd = new Date(period.to.getTime() - 1);
      periodHeader =
        formatWeekdayShort(period.from) + " " + formatDayMonth(period.from) +
        " – " +
        formatWeekdayShort(weekEnd) + " " + formatDayMonth(weekEnd);
    } else if (historyMode === "month" && period.from && period.to) {
      var monthEnd = new Date(period.to.getTime() - 1);
      periodHeader =
        formatWeekdayShort(period.from) + " " + formatDayMonth(period.from) +
        " – " +
        formatWeekdayShort(monthEnd) + " " + formatDayMonth(monthEnd);
    }
    if (periodHeader) {
      var pCls = "kv-row kv-period-header" + (canEditFields && periodEditable ? " kv-editable" : "");
      var pAttrs = canEditFields && periodEditable
        ? ' role="button" tabindex="0" data-edit-field="' + periodEditable + '"'
        : "";
      html += '<div class="' + pCls + '"' + pAttrs + ">" + periodHeader + "</div>";
    }

    // Row 2: Totalt inkört (adjusted)
    html += pairRow(
      "Totalt inkört",
      formatMoney(Math.round(displayAmount)),
      "kv-money",
      "amount"
    );

    // Dricks: day = taxi only | week/month = taxi + Uber tips + Uber bonus
    var dricksDisplay = displayTipsBonus;
    if (historyMode === "week" || historyMode === "month") {
      dricksDisplay = displayTipsBonus + uberTips + uberBonus;
    }
    html += pairRow(
      "Dricks",
      formatMoney(Math.round(dricksDisplay)),
      "",
      historyMode === "day" ? "tips" : null
    );

    // Hours + kr/timme based on completed shifts only
    var hoursLeft = fmtNum(hoursCompleted, 1) + " h";
    var hoursRight = Math.round(displayKrPerHour).toLocaleString("sv-SE") + " kr/timme";
    html += pairRow(hoursLeft, hoursRight, "", null);

    var kmLeft = fmtNum(displayKm, 0) + " km";
    var kmRight = fmtNum(displayKrPerMil, 1) + " kr/mil";
    html += pairRow(kmLeft, kmRight, "", "km");

    var shiftCount = completed.length + (hasActive ? 1 : 0);
    var shiftLeft = shiftCount + " skift";
    var shiftRight = Math.round(displayKrPerShift).toLocaleString("sv-SE") + " kr/skift";
    html += pairRow(shiftLeft, shiftRight, "", null);

    if (period.from && period.to && now < period.to && (historyMode === "week" || historyMode === "month")) {
      var goal = historyMode === "week" ? state.weekGoal : state.monthGoal;
      // Remaining vs adjusted inkört (performance goal)
      var remaining = Math.max(0, goal - totalAmount);
      var remShifts = remainingShiftSlots(period.from, period.to, now);
      var needed = remShifts > 0 ? remaining / remShifts : remaining;
      var prognos;
      if (completed.length > 0 && remShifts > 0) {
        prognos = totalAmount + krPerShift * remShifts + totalTipsBonus + uberTipsBonus;
      } else {
        prognos = totalAmount + totalTipsBonus + uberTipsBonus;
      }
      html += pairRow("Prognos", formatMoney(Math.round(prognos)), "kv-prognos", null);
      html += pairRow(
        "Kvar / skift",
        Math.round(needed).toLocaleString("sv-SE") + " kr · " + remShifts + " kvar",
        "",
        null
      );
    }

    if (historyMode === "week" || historyMode === "month") {
      var goalVal = historyMode === "week" ? state.weekGoal : state.monthGoal;
      html +=
        '<div class="kv-row kv-row-goal" role="button" tabindex="0" id="editGoalRow">' +
        '<span class="kv-pair-left">Mål · redigera</span>' +
        '<span class="kv-pair-right kv-value goal">' + formatMoney(goalVal) + "</span>" +
        "</div>";
    }

    box.innerHTML = html;

    var goalRow = $("editGoalRow");
    if (goalRow) {
      goalRow.addEventListener("click", openEditGoal);
    }

    if (canEditFields) {
      box.querySelectorAll("[data-edit-field]").forEach(function (row) {
        row.addEventListener("click", function () {
          openFieldEdit(dayEditShiftId, row.getAttribute("data-edit-field"));
        });
      });
    }
  }

  async function openFieldEdit(shiftId, field) {
    var shift = state.shifts.find(function (s) { return s.id === shiftId; });
    if (!shift) return;
    shift = normalizeShift(shift);

    var title = "Redigera";
    var bodyHtml = "";
    var modalMode = "field";

    if (field === "amount") {
      title = "Inkört";
      modalMode = "amountPair";
      bodyHtml =
        '<div class="form-row" style="margin-bottom:0">' +
        '<div class="field"><label for="modalAmount">Totalt inkört</label>' +
        '<input type="number" id="modalAmount" inputmode="numeric" min="0" step="1" value="' +
        (shift.amount != null ? shift.amount : "") + '" /></div>' +
        '<div class="field"><label for="modalUber">Varav Uber</label>' +
        '<input type="number" id="modalUber" inputmode="numeric" min="0" step="1" value="' +
        (shift.uberGross || "") + '" placeholder="0" /></div>' +
        "</div>";
    } else if (field === "tips") {
      title = "Dricks";
      bodyHtml =
        '<div class="field" style="margin-bottom:0">' +
        '<label for="modalField">Dricks taxi (kr)</label>' +
        '<input type="number" id="modalField" inputmode="numeric" min="0" step="1" value="' +
        (shift.tips || "") + '" /></div>';
    } else if (field === "km") {
      title = "Körda km";
      bodyHtml =
        '<div class="field" style="margin-bottom:0">' +
        '<label for="modalField">Körda km</label>' +
        '<input type="number" id="modalField" inputmode="numeric" min="0" step="1" value="' +
        (shift.km != null ? shift.km : "") + '" /></div>';
    } else if (field === "times") {
      title = "Tider";
      modalMode = "timesFull";
      bodyHtml =
        '<div class="form-row">' +
        '<div class="field"><label for="modalStartDate">Start datum</label>' +
        '<input type="text" id="modalStartDate" inputmode="numeric" maxlength="10" value="' + toEditDate(shift.start) + '" /></div>' +
        '<div class="field"><label for="modalStartTime">Start (TTMM)</label>' +
        '<input type="text" id="modalStartTime" inputmode="numeric" maxlength="4" value="' + toCompactTime(shift.start) + '" /></div>' +
        "</div>" +
        '<div class="form-row" style="margin-bottom:0">' +
        '<div class="field"><label for="modalEndDate">Slut datum</label>' +
        '<input type="text" id="modalEndDate" inputmode="numeric" maxlength="10" value="' + toEditDate(shift.end) + '" /></div>' +
        '<div class="field"><label for="modalEndTime">Slut (TTMM)</label>' +
        '<input type="text" id="modalEndTime" inputmode="numeric" maxlength="4" value="' + toCompactTime(shift.end) + '" /></div>' +
        "</div>";
    } else {
      return;
    }

    var result = await openModal({
      mode: modalMode,
      title: title,
      bodyHtml: bodyHtml,
      okText: "Spara",
      okClass: "green",
      cancelText: "Avbryt"
    });
    if (!result) return;

    var idx = state.shifts.findIndex(function (s) { return s.id === shiftId; });
    if (idx === -1) return;
    var s = normalizeShift(state.shifts[idx]);

    if (field === "amount") {
      s.amount = result.amount;
      s.uberGross = result.uberGross || 0;
    } else if (field === "tips") s.tips = result.value;
    else if (field === "km") s.km = result.value;
    else if (field === "times") {
      s.start = result.start;
      s.end = result.end;
    }

    s.updatedAt = Date.now();
    state.shifts[idx] = s;
    saveState();
    renderHistory();
    toast("Sparat");
  }

  async function openEditGoal() {
    var isWeek = historyMode === "week";
    var current = isWeek ? state.weekGoal : state.monthGoal;
    var label = isWeek ? "Veckomål (kr)" : "Månadsmål (kr)";
    var result = await openModal({
      mode: "goal",
      title: isWeek ? "Redigera veckomål" : "Redigera månadsmål",
      bodyHtml:
        '<div class="field" style="margin-bottom:0">' +
        '<label for="modalGoal">' + label + "</label>" +
        '<input type="number" id="modalGoal" inputmode="numeric" min="0" step="500" value="' + current + '" />' +
        "</div>",
      okText: "Spara",
      okClass: "green",
      cancelText: "Avbryt"
    });
    if (!result) return;
    if (isWeek) state.weekGoal = result.goal;
    else state.monthGoal = result.goal;
    state._metaUpdatedAt = Date.now();
    saveState();
    renderHistory();
    toast("Mål sparat");
  }

