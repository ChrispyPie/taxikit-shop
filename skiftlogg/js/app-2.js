/* app-2.js */
  function renderSettings() {
    renderAccountUI();
  }

  function renderAccountUI() {
    var emailEl = $("accountEmail");
    var metaEl = $("accountSyncMeta");
    var actions = $("accountActions");
    var chip = $("accountChip");
    if (!emailEl || !metaEl || !actions) return;

    if (fbUser) {
      var name = fbUser.displayName || "";
      var email = fbUser.email || "";
      emailEl.textContent = name ? (name + (email ? " · " + email : "")) : (email || "Inloggad");
      if (chip) {
        chip.textContent = name || email || "Inloggad";
        chip.classList.add("signed-in");
      }
      var syncText;
      if (!navigator.onLine) {
        metaEl.className = "account-meta offline";
        syncText = "Offline · synkar när du är online";
      } else if (syncInFlight) {
        metaEl.className = "account-meta syncing";
        syncText = "Synkar…";
      } else if (lastSyncError) {
        metaEl.className = "account-meta offline";
        syncText = "Synkfel: " + lastSyncError;
      } else if (lastSyncAt) {
        metaEl.className = "account-meta online";
        syncText = "Synkad · " + formatDateTime(new Date(lastSyncAt).toISOString());
      } else {
        metaEl.className = "account-meta online";
        syncText = "Inloggad · molnsynk aktiv";
      }
      metaEl.textContent = syncText;
      actions.innerHTML =
        '<button type="button" class="btn-sync" id="syncNowBtn">Synka nu</button>' +
        '<button type="button" class="btn-signout" id="googleSignOutBtn">Logga ut</button>';
      var syncBtn = $("syncNowBtn");
      var outBtn = $("googleSignOutBtn");
      if (syncBtn) syncBtn.onclick = function () { fullCloudSync(true); };
      if (outBtn) outBtn.onclick = function () { signOutGoogle(); };
    } else {
      emailEl.textContent = "Ej inloggad";
      metaEl.className = "account-meta";
      metaEl.textContent = fbReady
        ? "Lokalt läge · fungerar offline"
        : "Lokalt läge · Firebase laddas…";
      if (chip) {
        chip.textContent = "Logga in";
        chip.classList.remove("signed-in");
      }
      actions.innerHTML =
        '<button type="button" class="btn-google" id="googleSignInBtn">' +
        '<svg viewBox="0 0 48 48" aria-hidden="true">' +
        '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
        '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
        '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
        '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
        "</svg>Logga in med Google</button>";
      var inBtn = $("googleSignInBtn");
      if (inBtn) inBtn.onclick = function () { signInWithGoogle(); };
    }
  }

  // —— Firebase cloud sync ——
  function initFirebase() {
    if (typeof firebase === "undefined") {
      fbReady = false;
      renderAccountUI();
      return;
    }
    try {
      var firebaseConfig = {
        apiKey: "AIzaSyDe05ttScf3EGh25xCm1bDzABIot_ztKDI",
        authDomain: "taxikit-skiftlogg.firebaseapp.com",
        projectId: "taxikit-skiftlogg",
        storageBucket: "taxikit-skiftlogg.firebasestorage.app",
        messagingSenderId: "304763676589",
        appId: "1:304763676589:web:81ae7ddbeb3a63301ee324",
        measurementId: "G-M3K1VV184B"
      };
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      auth = firebase.auth();
      db = firebase.firestore();
      fbReady = true;

      auth.onAuthStateChanged(function (user) {
        fbUser = user || null;
        renderAccountUI();
        if (fbUser) {
          fullCloudSync(false);
        }
      });
    } catch (err) {
      fbReady = false;
      lastSyncError = "Kunde inte starta Firebase";
      renderAccountUI();
    }
  }

  function shiftsCol() {
    if (!fbUser || !db) return null;
    return db.collection("users").doc(fbUser.uid).collection("shifts");
  }

  function metaRef() {
    if (!fbUser || !db) return null;
    return db.collection("users").doc(fbUser.uid).collection("meta").doc("app");
  }

  function shiftToCloud(s) {
    var km = null;
    if (s.km != null && Number.isFinite(Number(s.km))) km = Number(s.km);
    return {
      id: s.id,
      start: s.start || null,
      end: s.end || null,
      amount: s.amount != null ? Number(s.amount) : null,
      uberGross: s.uberGross != null ? Number(s.uberGross) : 0,
      tips: s.tips != null ? Number(s.tips) : 0,
      bonus: s.bonus != null ? Number(s.bonus) : 0,
      km: km,
      breaks: Array.isArray(s.breaks) ? s.breaks : [],
      updatedAt: s.updatedAt || Date.now()
    };
  }

  function shiftFromCloud(data, docId) {
    if (!data) return null;
    var km = null;
    if (data.km != null && Number.isFinite(Number(data.km))) {
      km = Number(data.km);
    } else if (data.odoStart != null && data.odoEnd != null) {
      var a = Number(data.odoStart);
      var b = Number(data.odoEnd);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) km = b - a;
    }
    return {
      id: data.id || docId,
      start: data.start,
      end: data.end || null,
      amount: data.amount != null ? Number(data.amount) : null,
      uberGross: data.uberGross != null ? Number(data.uberGross) : 0,
      tips: data.tips != null ? Number(data.tips) : 0,
      bonus: data.bonus != null ? Number(data.bonus) : 0,
      km: km,
      breaks: Array.isArray(data.breaks) ? data.breaks : [],
      updatedAt: data.updatedAt || 0
    };
  }

  function mergeTwoShifts(a, b) {
    // Prefer newer timestamp as base, then fill missing fields from the other
    var aNewer = (a.updatedAt || 0) >= (b.updatedAt || 0);
    var primary = aNewer ? a : b;
    var secondary = aNewer ? b : a;
    function pickNum(pa, pb, fallback) {
      if (pa != null && Number(pa) !== 0) return Number(pa);
      if (pb != null && Number(pb) !== 0) return Number(pb);
      if (pa != null) return Number(pa);
      if (pb != null) return Number(pb);
      return fallback;
    }
    function pickKm(pa, pb) {
      if (pa != null && Number.isFinite(Number(pa))) return Number(pa);
      if (pb != null && Number.isFinite(Number(pb))) return Number(pb);
      return null;
    }
    return {
      id: primary.id,
      start: primary.start || secondary.start,
      end: primary.end || secondary.end || null,
      amount: primary.amount != null ? primary.amount : secondary.amount,
      uberGross: pickNum(primary.uberGross, secondary.uberGross, 0),
      tips: pickNum(primary.tips, secondary.tips, 0),
      bonus: pickNum(primary.bonus, secondary.bonus, 0),
      km: pickKm(primary.km, secondary.km),
      breaks: (primary.breaks && primary.breaks.length) ? primary.breaks : (secondary.breaks || []),
      updatedAt: Math.max(primary.updatedAt || 0, secondary.updatedAt || 0)
    };
  }

  function mergeShiftLists(localList, remoteList) {
    var map = {};
    remoteList.forEach(function (s) {
      if (s && s.id) map[s.id] = s;
    });
    localList.forEach(function (s) {
      if (!s || !s.id) return;
      if (!map[s.id]) {
        map[s.id] = s;
      } else {
        map[s.id] = mergeTwoShifts(s, map[s.id]);
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function scheduleCloudSync() {
    if (!fbUser || !fbReady || !navigator.onLine) {
      renderAccountUI();
      return;
    }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      pushCloudState();
    }, 500);
  }

  async function pushCloudState() {
    if (!fbUser || !db || !navigator.onLine || syncInFlight) return;
    var col = shiftsCol();
    var meta = metaRef();
    if (!col || !meta) return;

    syncInFlight = true;
    renderAccountUI();
    try {
      // Process pending deletes
      for (var i = 0; i < pendingDeletedIds.length; i++) {
        await col.doc(pendingDeletedIds[i]).delete();
      }
      pendingDeletedIds = [];

      var batch = db.batch();
      var count = 0;
      state.shifts.forEach(function (s) {
        if (!s.id) return;
        batch.set(col.doc(s.id), shiftToCloud(s), { merge: true });
        count++;
        if (count >= 400) {
          // flush intermediate batches if huge
        }
      });
      batch.set(meta, {
        weekGoal: state.weekGoal,
        monthGoal: state.monthGoal,
        activeShift: state.activeShift || null,
        uberReports: state.uberReports || [],
        updatedAt: Date.now()
      }, { merge: true });
      await batch.commit();
      lastSyncAt = Date.now();
      lastSyncError = null;
    } catch (err) {
      lastSyncError = (err && err.message) ? err.message.slice(0, 80) : "okänt fel";
    }
    syncInFlight = false;
    renderAccountUI();
  }

  async function pullCloudState() {
    if (!fbUser || !db || !navigator.onLine) return null;
    var col = shiftsCol();
    var meta = metaRef();
    if (!col || !meta) return null;

    var snap = await col.get();
    var remoteShifts = [];
    snap.forEach(function (doc) {
      var s = shiftFromCloud(doc.data(), doc.id);
      if (s && s.start) remoteShifts.push(s);
    });
    var metaSnap = await meta.get();
    var remoteMeta = metaSnap.exists ? metaSnap.data() : null;
    return { shifts: remoteShifts, meta: remoteMeta };
  }

  async function fullCloudSync(showToast) {
    if (!fbUser) {
      if (showToast) toast("Logga in för molnsynk");
      return;
    }
    if (!navigator.onLine) {
      if (showToast) toast("Ingen nätverksanslutning");
      renderAccountUI();
      return;
    }
    if (syncInFlight) return;

    syncInFlight = true;
    renderAccountUI();
    try {
      var remote = await pullCloudState();
      if (remote) {
        var merged = mergeShiftLists(state.shifts, remote.shifts);
        state.shifts = merged;

        if (remote.meta) {
          // Goals: keep higher of local/remote or prefer remote if local is default-only?
          // Prefer newer meta.updatedAt
          var localMetaTs = state._metaUpdatedAt || 0;
          var remoteMetaTs = remote.meta.updatedAt || 0;
          if (remoteMetaTs >= localMetaTs) {
            if (remote.meta.weekGoal != null) state.weekGoal = Number(remote.meta.weekGoal) || state.weekGoal;
            if (remote.meta.monthGoal != null) state.monthGoal = Number(remote.meta.monthGoal) || state.monthGoal;
            if (Array.isArray(remote.meta.uberReports)) {
              state.uberReports = remote.meta.uberReports;
            }
            // Active shift: prefer local if currently active; else remote if no local active
            if (!state.activeShift && remote.meta.activeShift) {
              state.activeShift = remote.meta.activeShift;
            } else if (state.activeShift && remote.meta.activeShift) {
              var la = state.activeShift.updatedAt || 0;
              var ra = remote.meta.activeShift.updatedAt || 0;
              if (ra > la) state.activeShift = remote.meta.activeShift;
            }
          } else if (Array.isArray(remote.meta.uberReports) && (!state.uberReports || !state.uberReports.length)) {
            state.uberReports = remote.meta.uberReports;
          }
        }

        // Remove any remote-only shifts that were deleted locally is handled by push after merge
        saveState({ sync: false });
        renderAll();
        if (isActive()) startTick();
        else stopTick();
      }

      syncInFlight = false;
      await pushCloudState();

      // After push, clean remote orphans (shifts in cloud not in local)
      try {
        var col = shiftsCol();
        if (col) {
          var snap2 = await col.get();
          var localIds = {};
          state.shifts.forEach(function (s) { localIds[s.id] = true; });
          var delBatch = db.batch();
          var dels = 0;
          snap2.forEach(function (doc) {
            if (!localIds[doc.id]) {
              delBatch.delete(doc.ref);
              dels++;
            }
          });
          if (dels > 0) await delBatch.commit();
        }
      } catch (e2) { /* ignore orphan cleanup errors */ }

      lastSyncAt = Date.now();
      lastSyncError = null;
      if (showToast) toast("Synk klar");
    } catch (err) {
      lastSyncError = (err && err.message) ? err.message.slice(0, 80) : "okänt fel";
      if (showToast) toast("Synk misslyckades");
    }
    syncInFlight = false;
    renderAccountUI();
  }

  async function signInWithGoogle() {
    if (!fbReady || !auth) {
      toast("Firebase inte redo");
      return;
    }
    if (!navigator.onLine) {
      toast("Kräver nätverk för inloggning");
      return;
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await auth.signInWithPopup(provider);
      toast("Inloggad");
      // onAuthStateChanged triggers fullCloudSync
    } catch (err) {
      // Fallback redirect for some mobile browsers
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment")) {
        try {
          await auth.signInWithRedirect(provider);
          return;
        } catch (err2) {
          toast("Inloggning misslyckades");
          return;
        }
      }
      if (err && err.code === "auth/popup-closed-by-user") return;
      toast("Inloggning misslyckades");
    }
  }

  async function signOutGoogle() {
    if (!auth) return;
    try {
      await auth.signOut();
      fbUser = null;
      lastSyncAt = null;
      lastSyncError = null;
      renderAccountUI();
      toast("Utloggad från Google");
    } catch (err) {
      toast("Kunde inte logga ut");
    }
  }

  function queueCloudShift(id) {
    if (!id) return;
    if (pendingDeletedIds.indexOf(id) === -1) pendingDeletedIds.push(id);
    scheduleCloudSync();
  }

  function renderAll() {
    renderStatus();
    renderHistory();
    renderSettings();
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(function () {
      if (!state.activeShift) return;
      var el = $("elapsedDisplay");
      if (el) {
        el.textContent = formatHours(shiftDurationMs({
          start: state.activeShift.start,
          end: null,
          breaks: state.activeShift.breaks || []
        }));
      }
      if ($("view-skift") && $("view-skift").classList.contains("active")) {
        renderHistory();
      }
    }, 30000);
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  // —— Actions ——
  async function handleLogin() {
    if (isActive()) return;
    var last = getLastCompletedShift();
    var continueHtml = last
      ? '<p class="continue-link-wrap"><button type="button" class="continue-link" id="continueShiftLink">Fortsätt föregående skift</button></p>'
      : "";
    var ok = await openModal({
      mode: "confirm",
      title: "Starta skift?",
      bodyHtml:
        "<p>Bekräfta för att starta ett <strong>nytt</strong> skift med aktuell tid.</p>" +
        continueHtml,
      okText: "OK",
      okClass: "green",
      cancelText: "Avbryt"
    });
    if (!ok) return;

    var nowIso = new Date().toISOString();

    if (ok.continue && last) {
      var breaks = getBreaks(last).slice();
      var breakStart = last.end;
      var breakEnd = nowIso;
      if (new Date(breakEnd) <= new Date(breakStart)) {
        breakEnd = new Date(new Date(breakStart).getTime() + 60000).toISOString();
      }
      breaks.push({ start: breakStart, end: breakEnd });
      state.shifts = state.shifts.filter(function (s) { return s.id !== last.id; });
      state.activeShift = {
        id: last.id,
        start: last.start,
        breaks: breaks,
        updatedAt: Date.now()
      };
      saveState();
      renderAll();
      startTick();
      toast("Fortsätter föregående skift");
      return;
    }

    state.activeShift = {
      id: uid(),
      start: nowIso,
      breaks: [],
      updatedAt: Date.now()
    };
    saveState();
    renderAll();
    startTick();
    toast("Skift startat");
  }

  async function handleLogout() {
    if (!isActive()) return;
    var result = await openModal({
      mode: "amount",
      title: "Avsluta skift",
      bodyHtml:
        '<div class="form-row">' +
        '<div class="field"><label for="modalAmount">Totalt inkört *</label>' +
        '<input type="number" id="modalAmount" inputmode="numeric" min="0" step="1" placeholder="t.ex. 3200" /></div>' +
        '<div class="field"><label for="modalUber">Varav Uber</label>' +
        '<input type="number" id="modalUber" inputmode="numeric" min="0" step="1" placeholder="0" /></div>' +
        "</div>" +
        '<div class="form-row" style="margin-bottom:0">' +
        '<div class="field"><label for="modalTips">Dricks taxi</label>' +
        '<input type="number" id="modalTips" inputmode="numeric" min="0" step="1" placeholder="0" /></div>' +
        '<div class="field"><label for="modalKm">Körda km</label>' +
        '<input type="number" id="modalKm" inputmode="numeric" min="0" step="1" placeholder="0" /></div>' +
        "</div>",
      okText: "Spara",
      okClass: "green",
      cancelText: "Avbryt"
    });
    if (!result) return;
    state.shifts.push({
      id: state.activeShift.id,
      start: state.activeShift.start,
      end: new Date().toISOString(),
      amount: result.amount,
      uberGross: result.uberGross || 0,
      tips: result.tips || 0,
      bonus: 0,
      km: result.km != null ? result.km : null,
      breaks: getBreaks(state.activeShift),
      updatedAt: Date.now()
    });
    state.activeShift = null;
    saveState();
    renderAll();
    stopTick();
    toast("Skift sparat · " + formatMoney(result.amount));
  }

  function buildBreakFieldsHtml(breaks) {
    var list = breaks && breaks.length ? breaks : [{ start: "", end: "" }];
    return list.map(function (b, i) {
      var startVal = b.start ? toEditDate(b.start) : "";
      var startTime = b.start ? toCompactTime(b.start) : "";
      var endVal = b.end ? toEditDate(b.end) : "";
      var endTime = b.end ? toCompactTime(b.end) : "";
      return (
        '<div class="break-block" data-break-index="' + i + '">' +
        '<div class="break-block-title">Rast ' + (i + 1) + "</div>" +
        '<div class="form-row">' +
        '<div class="field"><label>Rast start (datum)</label>' +
        '<input type="text" data-break-field="startDate" inputmode="numeric" maxlength="10" value="' + startVal + '" placeholder="ÅÅÅÅ-MM-DD" /></div>' +
        '<div class="field"><label>Rast start (TTMM)</label>' +
        '<input type="text" data-break-field="startTime" inputmode="numeric" maxlength="4" value="' + startTime + '" placeholder="TTMM" /></div>' +
        "</div>" +
        '<div class="form-row">' +
        '<div class="field"><label>Rast slut (datum)</label>' +
        '<input type="text" data-break-field="endDate" inputmode="numeric" maxlength="10" value="' + endVal + '" placeholder="ÅÅÅÅ-MM-DD" /></div>' +
        '<div class="field"><label>Rast slut (TTMM)</label>' +
        '<input type="text" data-break-field="endTime" inputmode="numeric" maxlength="4" value="' + endTime + '" placeholder="TTMM" /></div>' +
        "</div>" +
        "</div>"
      );
    }).join("");
  }

  async function openEditShift(id) {
    var shift = state.shifts.find(function (s) { return s.id === id; });
    if (!shift) return;
    shift = normalizeShift(shift);

    var body =
      '<div class="form-row">' +
      '<div class="field"><label for="editStartDate">Inloggning (datum)</label>' +
      '<input type="text" id="editStartDate" inputmode="numeric" maxlength="10" value="' + toEditDate(shift.start) + '" /></div>' +
      '<div class="field"><label for="editStartTime">Inloggning (TTMM)</label>' +
      '<input type="text" id="editStartTime" inputmode="numeric" maxlength="4" value="' + toCompactTime(shift.start) + '" /></div>' +
      "</div>" +
      '<div class="form-row">' +
      '<div class="field"><label for="editEndDate">Utloggning (datum)</label>' +
      '<input type="text" id="editEndDate" inputmode="numeric" maxlength="10" value="' + toEditDate(shift.end) + '" /></div>' +
      '<div class="field"><label for="editEndTime">Utloggning (TTMM)</label>' +
      '<input type="text" id="editEndTime" inputmode="numeric" maxlength="4" value="' + toCompactTime(shift.end) + '" /></div>' +
      "</div>" +
      '<div class="field"><label for="editAmount">Totalt inkört (kr)</label>' +
      '<input type="number" id="editAmount" inputmode="numeric" min="0" step="1" value="' + (shift.amount != null ? shift.amount : "") + '" /></div>' +
      '<div class="field"><label for="editUber">Varav Uber (brutto, kr)</label>' +
      '<input type="number" id="editUber" inputmode="numeric" min="0" step="1" value="' + (shift.uberGross || "") + '" /></div>' +
      '<div class="field"><label for="editTips">Dricks taxi (kr)</label>' +
      '<input type="number" id="editTips" inputmode="numeric" min="0" step="1" value="' + (shift.tips || "") + '" /></div>' +
      '<div class="field"><label for="editKm">Körda km</label>' +
      '<input type="number" id="editKm" inputmode="numeric" min="0" step="1" value="' + (shift.km != null ? shift.km : "") + '" /></div>' +
      buildBreakFieldsHtml(shift.breaks) +
      '<p class="hint">Lämna valfria fält tomma om de saknas. Rastfält tomma = ingen rast.</p>' +
      '<button type="button" class="btn-secondary btn-danger" id="deleteShiftBtn" style="width:100%;margin-top:4px">Ta bort skift</button>';

    var result = await openModal({
      mode: "edit",
      editingId: id,
      title: "Redigera skift",
      bodyHtml: body,
      okText: "Spara",
      cancelText: "Avbryt"
    });

    if (!result) return;

    if (result.deleted) {
      state.shifts = state.shifts.filter(function (s) { return s.id !== id; });
      queueCloudShift(id);
      saveState();
      renderAll();
      toast("Skift borttaget");
      return;
    }

    var idx = state.shifts.findIndex(function (s) { return s.id === id; });
    if (idx === -1) return;
    state.shifts[idx] = {
      id: id,
      start: result.start,
      end: result.end,
      amount: result.amount,
      uberGross: result.uberGross || 0,
      tips: result.tips || 0,
      bonus: 0,
      km: result.km != null ? result.km : null,
      breaks: result.breaks || [],
      updatedAt: Date.now()
    };
    saveState();
    renderAll();
    toast("Skift uppdaterat");
  }

  function collectBreaksFromForm() {
    var blocks = $("modalBody").querySelectorAll(".break-block");
    var breaks = [];
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i];
      var sd = el.querySelector('[data-break-field="startDate"]').value.trim();
      var st = el.querySelector('[data-break-field="startTime"]').value.trim();
      var ed = el.querySelector('[data-break-field="endDate"]').value.trim();
      var et = el.querySelector('[data-break-field="endTime"]').value.trim();
      // All empty = no break
      if (!sd && !st && !ed && !et) continue;
      if (!sd || !st || !ed || !et) {
        toast("Fyll i alla rastfält eller lämna dem tomma (rast " + (i + 1) + ")");
        return null;
      }
      var bStart = combineDateTime(sd, st);
      var bEnd = combineDateTime(ed, et);
      if (!bStart || !bEnd) {
        toast("Ogiltig rasttid (rast " + (i + 1) + ")");
        return null;
      }
      if (bEnd <= bStart) {
        toast("Rast slut måste vara efter rast start (rast " + (i + 1) + ")");
        return null;
      }
      breaks.push({ start: bStart.toISOString(), end: bEnd.toISOString() });
    }
    return breaks;
  }

  // Modal OK
  $("modalOk").addEventListener("click", function () {
    if (modalMode === "amount") {
      var amountEl = $("modalAmount");
      var val = amountEl ? amountEl.value.trim() : "";
      if (val === "" || !/^\d+$/.test(val)) {
        toast("Ange belopp som heltal");
        if (amountEl) amountEl.focus();
        return;
      }
      function optInt(id) {
        var el = $(id);
        if (!el) return 0;
        var v = el.value.trim();
        if (v === "" || !/^\d+$/.test(v)) return 0;
        return parseInt(v, 10);
      }
      var kmEl = $("modalKm");
      var kmVal = kmEl ? kmEl.value.trim() : "";
      closeModal({
        amount: parseInt(val, 10),
        uberGross: optInt("modalUber"),
        tips: optInt("modalTips"),
        bonus: 0,
        km: kmVal !== "" && /^\d+$/.test(kmVal) ? parseInt(kmVal, 10) : null
      });
      return;
    }

    if (modalMode === "amountPair") {
      var apEl = $("modalAmount");
      var apVal = apEl ? apEl.value.trim() : "";
      if (apVal === "" || !/^\d+$/.test(apVal)) {
        toast("Ange totalt inkört som heltal");
        if (apEl) apEl.focus();
        return;
      }
      var uberEl = $("modalUber");
      var uberVal = uberEl ? uberEl.value.trim() : "";
      var uberGross = 0;
      if (uberVal !== "") {
        if (!/^\d+$/.test(uberVal)) {
          toast("Ange Uber som heltal");
          if (uberEl) uberEl.focus();
          return;
        }
        uberGross = parseInt(uberVal, 10);
      }
      closeModal({
        amount: parseInt(apVal, 10),
        uberGross: uberGross
      });
      return;
    }

    if (modalMode === "uberReport") {
      function parseMoneyField(id) {
        var el = $(id);
        if (!el) return 0;
        var v = el.value.trim().replace(",", ".");
        if (v === "") return 0;
        var n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      }
      var kundpris = parseMoneyField("uberKundpris");
      var utmaning = parseMoneyField("uberUtmaning");
      var kampanjer = parseMoneyField("uberKampanjer");
      var tips = parseMoneyField("uberTips");
      var totalIntakter = parseMoneyField("uberTotal");
      if (kundpris === null || utmaning === null || kampanjer === null || tips === null || totalIntakter === null) {
        toast("Ange giltiga belopp");
        return;
      }
      closeModal({
        kundpris: kundpris,
        utmaning: utmaning,
        kampanjer: kampanjer,
        tips: tips,
        totalIntakter: totalIntakter
      });
      return;
    }

    if (modalMode === "goal") {
      var goalEl = $("modalGoal");
      var gVal = goalEl ? goalEl.value.trim() : "";
      if (gVal === "" || !/^\d+$/.test(gVal)) {
        toast("Ange mål som heltal");
        if (goalEl) goalEl.focus();
        return;
      }
      closeModal({ goal: parseInt(gVal, 10) });
      return;
    }

    if (modalMode === "odo") {
      var odoEl = $("modalOdoStart");
      var odoVal = odoEl ? odoEl.value.trim() : "";
      if (odoVal === "") {
        closeModal({ odoStart: null });
        return;
      }
      if (!/^\d+$/.test(odoVal)) {
        toast("Ange mätarställning som heltal (km)");
        if (odoEl) odoEl.focus();
        return;
      }
      closeModal({ odoStart: parseInt(odoVal, 10) });
      return;
    }

    if (modalMode === "field") {
      var fieldEl = $("modalField");
      var fVal = fieldEl ? fieldEl.value.trim() : "";
      if (fVal === "") {
        closeModal({ value: 0 });
        return;
      }
      if (!/^\d+$/.test(fVal)) {
        toast("Ange ett heltal");
        if (fieldEl) fieldEl.focus();
        return;
      }
      closeModal({ value: parseInt(fVal, 10) });
      return;
    }

    if (modalMode === "datetime") {
      var dStr = $("modalEditDate") ? $("modalEditDate").value.trim() : "";
      var tStr = $("modalEditTime") ? $("modalEditTime").value.trim() : "";
      var dt = combineDateTime(dStr, tStr);
      if (!dt) {
        toast("Ogiltigt datum/tid (ÅÅÅÅ-MM-DD + TTMM)");
        return;
      }
      closeModal({ iso: dt.toISOString() });
      return;
    }

    if (modalMode === "timesFull") {
      var sDt = combineDateTime(
        $("modalStartDate") ? $("modalStartDate").value.trim() : "",
        $("modalStartTime") ? $("modalStartTime").value.trim() : ""
      );
      var eDt = combineDateTime(
        $("modalEndDate") ? $("modalEndDate").value.trim() : "",
        $("modalEndTime") ? $("modalEndTime").value.trim() : ""
      );
      if (!sDt || !eDt) {
        toast("Ogiltigt datum/tid");
        return;
      }
      if (eDt <= sDt) {
        toast("Slut måste vara efter start");
        return;
      }
      closeModal({
        start: sDt.toISOString(),
        end: eDt.toISOString()
      });
      return;
    }

    if (modalMode === "manualShift") {
      var sDt = combineDateTime(
        $("manStartDate").value.trim(),
        $("manStartTime").value.trim()
      );
      var eDt = combineDateTime(
        $("manEndDate").value.trim(),
        $("manEndTime").value.trim()
      );
      var amt = $("manAmount").value.trim();
      if (!sDt || !eDt) {
        toast("Ogiltigt datum/tid");
        return;
      }
      if (eDt <= sDt) {
        toast("Slut måste vara efter start");
        return;
      }
      if (amt === "" || !/^\d+$/.test(amt)) {
        toast("Ange inkört som heltal");
        return;
      }
      function manInt(id) {
        var el = $(id);
        if (!el) return 0;
        var v = el.value.trim();
        return v !== "" && /^\d+$/.test(v) ? parseInt(v, 10) : 0;
      }
      function manKm() {
        var el = $("manKm");
        if (!el) return null;
        var v = el.value.trim();
        return v !== "" && /^\d+$/.test(v) ? parseInt(v, 10) : null;
      }
      closeModal({
        start: sDt.toISOString(),
        end: eDt.toISOString(),
        amount: parseInt(amt, 10),
        uberGross: manInt("manUber"),
        tips: manInt("manTips"),
        km: manKm()
      });
      return;
    }

    if (modalMode === "edit") {
      var start = combineDateTime(
        $("editStartDate").value.trim(),
        $("editStartTime").value.trim()
      );
      var end = combineDateTime(
        $("editEndDate").value.trim(),
        $("editEndTime").value.trim()
      );
      var amount = $("editAmount").value.trim();
      if (!start) {
        toast("Ogiltig inloggning (ÅÅÅÅ-MM-DD + TTMM)");
        return;
      }
      if (!end) {
        toast("Ogiltig utloggning (ÅÅÅÅ-MM-DD + TTMM)");
        return;
      }
      if (end < start) {
        toast("Utloggning måste vara efter inloggning");
        return;
      }
      if (end.getTime() === start.getTime()) {
        end = new Date(end.getTime() + 60000);
      }
      if (amount === "" || !/^\d+$/.test(amount)) {
        toast("Ange belopp som heltal");
        return;
      }
      function optEditInt(id) {
        var el = $(id);
        if (!el) return 0;
        var v = el.value.trim();
        if (v === "" || !/^\d+$/.test(v)) return 0;
        return parseInt(v, 10);
      }
      function optEditOdo(id) {
        var el = $(id);
        if (!el) return null;
        var v = el.value.trim();
        if (v === "") return null;
        if (!/^\d+$/.test(v)) return null;
        return parseInt(v, 10);
      }
      var breaks = collectBreaksFromForm();
      if (breaks === null) return;
      // Breaks should be within shift
      for (var bi = 0; bi < breaks.length; bi++) {
        var bs = new Date(breaks[bi].start);
        var be = new Date(breaks[bi].end);
        if (bs < start || be > end) {
          toast("Rast måste ligga inom skiftet (rast " + (bi + 1) + ")");
          return;
        }
      }
      closeModal({
        start: start.toISOString(),
        end: end.toISOString(),
        amount: parseInt(amount, 10),
        uberGross: optEditInt("editUber"),
        tips: optEditInt("editTips"),
        bonus: 0,
        km: optEditOdo("editKm"),
        breaks: breaks
      });
      return;
    }

    if (modalMode === "delete") {
      closeModal({ deleted: true });
      return;
    }

    closeModal(true);
  });

  $("modalCancel").addEventListener("click", function () {
    closeModal(null);
  });

  $("modalBackdrop").addEventListener("click", function (e) {
    if (e.target === $("modalBackdrop")) closeModal(null);
  });

  $("modalBody").addEventListener("click", function (e) {
    if (e.target && e.target.id === "continueShiftLink") {
      e.preventDefault();
      e.stopPropagation();
      closeModal({ continue: true });
      return;
    }
    if (!e.target || e.target.id !== "deleteShiftBtn") return;
    e.preventDefault();
    e.stopPropagation();
    var keepId = editingId;
    modalMode = "delete";
    $("modalTitle").textContent = "Ta bort skift?";
    $("modalBody").innerHTML = "<p>Skiftet raderas permanent.</p>";
    $("modalOk").textContent = "Ta bort";
    $("modalOk").className = "ok danger";
    editingId = keepId;
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && $("modalBackdrop").classList.contains("open")) {
      closeModal(null);
    }
  });

  $("mainActionBtn").addEventListener("click", function () {
    if (isActive()) handleLogout();
    else handleLogin();
  });

  var FEED_PREFS_KEY = "taxikit-feed-prefs-v3";
  var DEFAULT_FEED_PREFS = {
    trafikOlycka: true,
    broHisingsbron: true,
    broJordfall: false,
    broBohus: false,
    eventUllevi: true,
    eventScandinavium: true,
    eventMassan: false,
    batDanmark: true,
    batTyskland: true,
    batSaltholmen: true,
    batVarholmen: false,
    batKornhall: true,
    batMarstrand: false,
    tagStockholm: true,
    tagOslo: true,
    tagKopenhamn: true,
    tagMalmo: true,
    tagOther: true,
    tagSnabbtagOnly: false,
    tagAnkomst: true,
    tagAvgang: true,
    flygStockholm: true,
    flygUtland: false,
    flygAnkomst: true,
    flygAvgang: true,
    flygDelayedOnly: false,
    showFlyg: true,
    showTag: true,
    showBat: true,
    showBro: true,
    showEvent: true
  };
  var feedPrefs = loadFeedPrefs();
  var flodeTab = "summary";
  var TV_KEY_STORE = "taxikit-tv-api-key";
  var liveTrafficItems = [];
  var liveTrafficMeta = { status: "idle", error: "", at: 0 };
  var liveFlightItems = [];
  var liveFlightMeta = { status: "idle", error: "", at: 0 };
  var liveTrainItems = [];
  var liveTrainMeta = { status: "idle", error: "", at: 0 };
  var GOT_CACHE_URLS = ["feed/got.json", "/skiftlogg/feed/got.json"];
  var TRAIN_CACHE_URLS = ["feed/tag.json", "/skiftlogg/feed/tag.json"];

  function getTvKey() {
    try { return (localStorage.getItem(TV_KEY_STORE) || "").trim(); } catch (e) { return ""; }
  }
  function setTvKey(v) {
    localStorage.setItem(TV_KEY_STORE, (v || "").trim());
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtClock(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function parseTvSituations(json) {
    var out = [];
    var results = (((json || {}).RESPONSE || {}).RESULT) || [];
    results.forEach(function (res) {
      (res.Situation || []).forEach(function (sit) {
        (sit.Deviation || []).forEach(function (dev) {
          var typ = (dev.MessageType || dev.MessageCode || "Händelse") + "";
          var road = dev.RoadNumber ? (dev.RoadNumber + " ") : "";
          var where = dev.LocationDescriptor || dev.PositionalDescription || dev.Header || "";
          var msg = (dev.Message || dev.Header || typ).replace(/\s+/g, " ").trim();
          var title = (road + where).trim() || typ;
          if (title.length > 72) title = title.slice(0, 70) + "…";
          var meta = typ;
          if (dev.SeverityText) meta += " · " + dev.SeverityText;
          if (msg && msg !== title) meta += " · " + msg.slice(0, 120);
          var tag = /olycka|hinder|kö/i.test(typ + " " + msg) ? "trafikOlycka" : "trafikOlycka";
          if (/broöpp|hisingsbro/i.test(title + " " + msg)) tag = "broHisingsbron";
          var wgs = (dev.Geometry && (dev.Geometry.WGS84 || (dev.Geometry.Point && dev.Geometry.Point.WGS84))) || "";
          var lat = null, lng = null;
          var mm = /POINT\s*\(\s*([0-9.+-]+)\s+([0-9.+-]+)/i.exec(wgs);
          if (mm) { lng = parseFloat(mm[1]); lat = parseFloat(mm[2]); }
          out.push({
            t: fmtClock(dev.StartTime || sit.PublicationTime) || "nu",
            type: "trafik",
            dir: "",
            title: title,
            meta: meta,
            tags: [tag],
            live: true,
            lat: lat,
            lng: lng,
            sort: new Date(dev.StartTime || sit.PublicationTime || 0).getTime() || 0
          });
        });
      });
    });
    out.sort(function (a, b) { return b.sort - a.sort; });
    return out.slice(0, 20);
  }

  function fetchLiveTraffic() {
    var key = getTvKey();
    var pill = $("flodeLivePill");
    if (!key) {
      liveTrafficItems = [];
      liveTrafficMeta = { status: "nokey", error: "", at: 0 };
      if (pill) pill.style.display = "none";
      return Promise.resolve();
    }
    if (pill) { pill.textContent = "hämtar…"; pill.style.display = ""; }
    var xml =
      '<REQUEST>' +
      '<LOGIN authenticationkey="' + key.replace(/[<>&"]/g, "") + '" />' +
      '<QUERY objecttype="Situation" namespace="road.trafficinfo" schemaversion="1.6" limit="40">' +
      '<FILTER>' +
      '<EQ name="Deviation.CountyNo" value="14" />' +
      '</FILTER>' +
      '<INCLUDE>Deviation.LocationDescriptor</INCLUDE>' +
      '<INCLUDE>PublicationTime</INCLUDE>' +
      '<INCLUDE>Deviation.Header</INCLUDE>' +
      '<INCLUDE>Deviation.Message</INCLUDE>' +
      '<INCLUDE>Deviation.MessageType</INCLUDE>' +
      '<INCLUDE>Deviation.MessageCode</INCLUDE>' +
      '<INCLUDE>Deviation.SeverityText</INCLUDE>' +
      '<INCLUDE>Deviation.StartTime</INCLUDE>' +
      '<INCLUDE>Deviation.Geometry.WGS84</INCLUDE>' +
      '<INCLUDE>Deviation.PositionalDescription</INCLUDE>' +
      '<INCLUDE>Deviation.RoadNumber</INCLUDE>' +
      '</QUERY></REQUEST>';
    return fetch("https://api.trafikinfo.trafikverket.se/v2/data.json", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: xml
    }).then(function (r) { return r.json(); }).then(function (json) {
      var err = json && json.RESPONSE && json.RESPONSE.RESULT && json.RESPONSE.RESULT[0] && json.RESPONSE.RESULT[0].ERROR;
      if (err) throw new Error(err.MESSAGE || "Trafikverket-fel");
      liveTrafficItems = parseTvSituations(json);
      liveTrafficMeta = { status: "ok", error: "", at: Date.now() };
      if (pill) pill.textContent = "live väg · " + liveTrafficItems.length;
    }).catch(function (e) {
      liveTrafficMeta = { status: "err", error: (e && e.message) || "nätfel", at: Date.now() };
      if (pill) pill.textContent = "trafikfel";
      console.warn("Trafikverket", e);
    });
  }

  function citySlug(name) {
    return String(name || "övrigt").toLowerCase()
      .replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "ovrigt";
  }
  function prettyTrainCity(name) {
    var n = String(name || "").trim();
    var map = {
      "Än": "Älvängen", "Ldo": "Lindome", "Uv": "Uddevalla", "Snu": "Stenungsund",
      "Bsc": "Borås C", "Vbc": "Varberg C", "Smd": "Strömstad", "Mst": "Mellerud",
      "Ksc": "Karlstad C", "Mc": "Malmö C", "M": "Malmö C", "Lu": "Lund C",
      "Dk.kh": "Köpenhamn H", "No.osl": "Oslo S",
      "So": "Solna", "Kac": "Kalmar C", "Khn": "Kristinehamn", "T": "Töreboda",
      "Vå": "Varberg", "Ör": "Örebro C", "Hb": "Helsingborg C", "Hel": "Helsingborg C",
      "Hie": "Helsingör", "Hd": "Halmstad C"
    };
    if (map[n]) return map[n];
    var low = n.toLowerCase();
    if (/stockholm|arlanda|solna/.test(low)) return "Stockholm";
    if (/oslo|no\.osl/.test(low)) return "Oslo";
    if (/köpenhamn|kobenhavn|københavn|copenhagen|dk\.kh/.test(low)) return "Köpenhamn";
    if (/malmö|^mc$/.test(low)) return "Malmö";
    return n.replace(/\s+c$/i, " C");
  }
  function trainDestKey(name) {
    var pretty = prettyTrainCity(name);
    var n = pretty.toLowerCase();
    if (/stockholm|arlanda|solna/.test(n)) return "tagCity:stockholm";
    if (/oslo/.test(n)) return "tagCity:oslo";
    if (/köpenhamn|kobenhavn|københavn/.test(n)) return "tagCity:kopenhamn";
    if (/malmö|malmo/.test(n)) return "tagCity:malmo";
    return "tagCity:" + citySlug(pretty);
  }
  function trainKindOf(f) {
    var blob = ((f.product || "") + " " + (f.traffic || "")).toLowerCase();
    if (/buss/.test(blob)) return "buss";
    if (f.snabb || /snabbtåg|x ?2000/.test(blob)) return "snabb";
    if (/öresund/.test(blob)) return "oresund";
    if (/pendel/.test(blob)) return "pendel";
    if (/regional/.test(blob)) return "regional";
    if (/västtåg/.test(blob)) return "vast";
    return "other";
  }
  var TRAIN_KIND_LABEL = {
    snabb: "Snabbtåg",
    regional: "Regional",
    pendel: "Pendeltåg",
    oresund: "Öresundståg",
    vast: "Västtågen",
    buss: "Ersättningsbuss",
    other: "Övriga"
  };
  function trainKindKey(dest, kind) {
    return "tagKind:" + dest + ":" + kind;
  }

  function destKey(name) {
    var n = (name || "övrigt").toLowerCase();
    if (/stockholm|arlanda|bromma|skavsta|\barn\b|\bbma\b|\bnyo\b/.test(n)) return "destStockholm";
    if (/köpenhamn|copenhagen|\bcph\b/.test(n)) return "destKopenhamn";
    if (/london|heathrow|gatwick|stansted|luton|\blhr\b|\blgw\b|\bstn\b|\bltn\b|\blcy\b/.test(n)) return "destLondon";
    if (/oslo|gardermoen|torp|\bosl\b|\btrf\b/.test(n)) return "destOslo";
    if (/paris|orly|\bcdg\b|\bory\b/.test(n)) return "destParis";
    if (/milano|milan|malpensa|bergamo|linate|\bmxp\b|\bbgy\b|\blin\b/.test(n)) return "destMilano";
    if (/rom\b|rome|fiumicino|ciampino|\bfco\b|\bcia\b/.test(n)) return "destRom";
    if (/istanbul|sabiha|\bist\b|\bsaw\b/.test(n)) return "destIstanbul";
    if (/amsterdam/.test(n)) return "destAmsterdam";
    if (/frankfurt/.test(n)) return "destFrankfurt";
    if (/münchen|munich/.test(n)) return "destMunchen";
    if (/helsingfors|helsinki/.test(n)) return "destHelsingfors";
    return "dest:" + n.replace(/[^a-z0-9åäö]+/gi, "-").slice(0, 28);
  }
  function flygAptKey(dest, apt) {
    return "flygApt:" + dest + ":" + String(apt || "").toUpperCase();
  }
  function aptLabel(code) {
    var map = {
      LHR: "Heathrow", LGW: "Gatwick", STN: "Stansted", LTN: "Luton", LCY: "City",
      ARN: "Arlanda", BMA: "Bromma", NYO: "Skavsta",
      CDG: "Charles de Gaulle", ORY: "Orly",
      MXP: "Malpensa", BGY: "Bergamo", LIN: "Linate",
      FCO: "Fiumicino", CIA: "Ciampino",
      IST: "Istanbul", SAW: "Sabiha",
      OSL: "Gardermoen", TRF: "Torp",
      CPH: "Kastrup", AMS: "Schiphol", BER: "Brandenburg"
    };
    var c = String(code || "").toUpperCase();
    return map[c] ? c + " · " + map[c] : c;
  }
  function inferApt(city, code) {
    if (code && /^[A-Z]{3}$/.test(code)) return code;
    var n = String(city || "").toLowerCase();
    var hits = [
      [/heathrow/, "LHR"], [/gatwick/, "LGW"], [/stansted/, "STN"], [/luton/, "LTN"],
      [/arlanda/, "ARN"], [/bromma/, "BMA"], [/skavsta/, "NYO"],
      [/orly/, "ORY"], [/charles|cdg/, "CDG"],
      [/malpensa/, "MXP"], [/bergamo/, "BGY"], [/linate/, "LIN"],
      [/fiumicino/, "FCO"], [/ciampino/, "CIA"],
      [/sabiha/, "SAW"], [/gardermoen/, "OSL"], [/torp/, "TRF"]
    ];
    for (var i = 0; i < hits.length; i++) {
      if (hits[i][0].test(n)) return hits[i][1];
    }
    return code || "";
  }
  var GOT_FLY_CATALOG = [
    ["Stockholm", "ARN"], ["Stockholm", "BMA"], ["Stockholm", "NYO"],
    ["London", "LHR"], ["London", "LGW"], ["London", "STN"],
    ["Oslo", "OSL"], ["Köpenhamn", "CPH"], ["Helsingfors", "HEL"],
    ["Amsterdam", "AMS"], ["Frankfurt", "FRA"], ["München", "MUC"],
    ["Paris", "CDG"], ["Bryssel", "BRU"], ["Zürich", "ZRH"], ["Wien", "VIE"],
    ["Berlin", "BER"], ["Düsseldorf", "DUS"], ["Hamburg", "HAM"],
    ["Istanbul", "IST"], ["Milano", "MXP"], ["Rom", "FCO"],
    ["Barcelona", "BCN"], ["Málaga", "AGP"], ["Alicante", "ALC"], ["Palma", "PMI"],
    ["Manchester", "MAN"], ["Edinburgh", "EDI"], ["Prag", "PRG"],
    ["Riga", "RIX"], ["Gdansk", "GDN"], ["Aten", "ATH"], ["Nice", "NCE"],
    ["Belgrad", "BEG"], ["Skopje", "SKP"], ["Tuzla", "TZL"], ["Warszawa", "WAW"],
    ["Bergen", "BGO"], ["Genève", "GVA"]
  ];
  var FLY_SEEN_KEY = "taxikit-fly-seen-v1";
  function loadSeenFlyDest() {
    try { return JSON.parse(localStorage.getItem(FLY_SEEN_KEY) || "[]"); } catch (e) { return []; }
  }
  var seenFlyDest = loadSeenFlyDest();
  function rememberFlyDest(rows) {
    var map = {};
    seenFlyDest.concat(rows || []).forEach(function (r) {
      if (!r || !r.city) return;
      map[r.city + "|" + (r.apt || "")] = { city: r.city, apt: r.apt || "" };
    });
    seenFlyDest = Object.keys(map).map(function (k) { return map[k]; });
    try { localStorage.setItem(FLY_SEEN_KEY, JSON.stringify(seenFlyDest)); } catch (e) {}
  }

  function destLabel(key, fallback) {
    var map = {
      destStockholm: "Stockholm",
      destKopenhamn: "Köpenhamn",
      destLondon: "London",
      destOslo: "Oslo",
      destMilano: "Milano",
      destRom: "Rom",
      destIstanbul: "Istanbul",
      destAmsterdam: "Amsterdam",
      destFrankfurt: "Frankfurt",
      destMunchen: "München",
      destHelsingfors: "Helsingfors",
      destParis: "Paris",
      tagStockholm: "Stockholm",
      tagOslo: "Oslo",
      tagKopenhamn: "Köpenhamn",
      tagMalmo: "Malmö",
      tagOther: "Övriga tåg"
    };
    if (map[key]) return map[key];
    if (key && key.indexOf("tagCity:") === 0) {
      return fallback || key.slice(8).replace(/-/g, " ");
    }
    return fallback || key.replace(/^dest:/, "");
  }

  function parseIsoLocal(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function splitPlace(s) {
    s = String(s || "").trim();
    var m = s.match(/^(.*?)(?:\s+([A-Z]{3}))$/);
    if (m) return { city: m[1].trim(), code: m[2] };
    return { city: s, code: "" };
  }

  function clockOf(iso) {
    var d = parseIsoLocal(iso);
    return d ? fmtClock(d.toISOString()) : "";
  }

  var STATUS_SV = {
    SCH: "Schemalagd", FPL: "Flygplan", FLS: "Stoppad", SEQ: "På väg in",
    ACT: "I luften", CAN: "Inställd", LAN: "Landat", RER: "Omdirigerad",
    DIV: "Omdirigerad", DEL: "Borttagen"
  };
  var COUNTRY_BY_CODE = {
    ARN: "Sverige", BMA: "Sverige", NYO: "Sverige", GOT: "Sverige",
    CPH: "Danmark", AAL: "Danmark", BLL: "Danmark",
    OSL: "Norge", BGO: "Norge", SVG: "Norge", TRD: "Norge",
    HEL: "Finland", TMP: "Finland",
    AMS: "Nederländerna", RTM: "Nederländerna",
    FRA: "Tyskland", MUC: "Tyskland", DUS: "Tyskland", HAM: "Tyskland", TXL: "Tyskland", BER: "Tyskland",
    LHR: "Storbritannien", LGW: "Storbritannien", STN: "Storbritannien", MAN: "Storbritannien", EDI: "Storbritannien",
    CDG: "Frankrike", ORY: "Frankrike", NCE: "Frankrike",
    BCN: "Spanien", AGP: "Spanien", ALC: "Spanien", PMI: "Spanien", TFS: "Spanien", LPA: "Spanien",
    FCO: "Italien", MXP: "Italien",
    VIE: "Österrike", ZRH: "Schweiz", GVA: "Schweiz", BRU: "Belgien",
    WAW: "Polen", KRK: "Polen", GDN: "Polen",
    PRG: "Tjeckien", BUD: "Ungern",
    IST: "Turkiet", SAW: "Turkiet", AYT: "Turkiet",
    ATH: "Grekland", SKG: "Grekland", CHQ: "Grekland", HER: "Grekland", CFU: "Grekland", ZTH: "Grekland",
    TLL: "Estland", RIX: "Lettland", KUN: "Litauen",
    BEG: "Serbien", SJJ: "Bosnien", TZL: "Bosnien", SKP: "Nordmakedonien", PRN: "Kosovo", ZAG: "Kroatien", SPU: "Kroatien", PUY: "Kroatien", DBV: "Kroatien",
    LCA: "Cypern",
    PSA: "Italien", BLQ: "Italien",
    PUY: "Kroatien", ZAD: "Kroatien",
    RHO: "Grekland", KGS: "Grekland", JTR: "Grekland",
    FAO: "Portugal", LIS: "Portugal", OPO: "Portugal",
    DUB: "Irland",
    BGY: "Italien", CIA: "Italien", NAP: "Italien",
    SXF: "Tyskland", CGN: "Tyskland", STR: "Tyskland",
    EIN: "Nederländerna"
  };
  var COUNTRY_BY_CITY = {
    stockholm: "Sverige", göteborg: "Sverige", malmö: "Sverige",
    köpenhamn: "Danmark", oslo: "Norge", bergen: "Norge",
    helsingfors: "Finland", amsterdam: "Nederländerna",
    frankfurt: "Tyskland", münchen: "Tyskland", munich: "Tyskland", düsseldorf: "Tyskland", hamburg: "Tyskland", berlin: "Tyskland",
    london: "Storbritannien", manchester: "Storbritannien", edinburgh: "Storbritannien",
    paris: "Frankrike", nice: "Frankrike",
    barcelona: "Spanien", malaga: "Spanien", málaga: "Spanien", alicante: "Spanien", palma: "Spanien", teneriffa: "Spanien", "gran canaria": "Spanien",
    rom: "Italien", rome: "Italien", milano: "Italien", milan: "Italien", pisa: "Italien", bologna: "Italien",
    istanbul: "Turkiet", antalya: "Turkiet",
    pula: "Kroatien", split: "Kroatien", dubrovnik: "Kroatien", zadar: "Kroatien",
    prag: "Tjeckien", prague: "Tjeckien", budapest: "Ungern",
    gdansk: "Polen", gdańsk: "Polen", warszawa: "Polen", warsaw: "Polen", krakow: "Polen", kraków: "Polen",
    belgrad: "Serbien", belgrade: "Serbien", skopje: "Nordmakedonien", pristina: "Kosovo", priština: "Kosovo",
    tuzla: "Bosnien", sarajevo: "Bosnien",
    atén: "Grekland", atene: "Grekland", athens: "Grekland", rhodos: "Grekland", kreta: "Grekland", heraklion: "Grekland", chania: "Grekland"
  };

  var ISO_BY_CODE = {
    ARN: "SE", BMA: "SE", NYO: "SE", GOT: "SE",
    CPH: "DK", AAL: "DK", BLL: "DK",
    OSL: "NO", BGO: "NO", SVG: "NO", TRD: "NO",
    HEL: "FI", TMP: "FI",
    AMS: "NL", RTM: "NL",
    FRA: "DE", MUC: "DE", DUS: "DE", HAM: "DE", TXL: "DE", BER: "DE",
    LHR: "GB", LGW: "GB", STN: "GB", MAN: "GB", EDI: "GB",
    CDG: "FR", ORY: "FR", NCE: "FR",
    BCN: "ES", AGP: "ES", ALC: "ES", PMI: "ES", TFS: "ES", LPA: "ES",
    FCO: "IT", MXP: "IT",
    VIE: "AT", ZRH: "CH", GVA: "CH", BRU: "BE",
    WAW: "PL", KRK: "PL", GDN: "PL",
    PRG: "CZ", BUD: "HU",
    IST: "TR", SAW: "TR", AYT: "TR",
    ATH: "GR", SKG: "GR", CHQ: "GR", HER: "GR", CFU: "GR", ZTH: "GR",
    TLL: "EE", RIX: "LV", KUN: "LT",
    BEG: "RS", SJJ: "BA", TZL: "BA", SKP: "MK", PRN: "XK", ZAG: "HR", SPU: "HR", PUY: "HR", DBV: "HR",
    LCA: "CY",
    PSA: "IT", BLQ: "IT",
    PUY: "HR", ZAD: "HR",
    RHO: "GR", KGS: "GR", JTR: "GR",
    FAO: "PT", LIS: "PT", OPO: "PT",
    DUB: "IE",
    BGY: "IT", CIA: "IT", NAP: "IT",
    SXF: "DE", CGN: "DE", STR: "DE",
    EIN: "NL"
  };

  function countryOf(city, code) {
    if (code && COUNTRY_BY_CODE[code]) return COUNTRY_BY_CODE[code];
    var k = String(city || "").toLowerCase();
    for (var name in COUNTRY_BY_CITY) {
      if (k.indexOf(name) >= 0) return COUNTRY_BY_CITY[name];
    }
    return "";
  }

  function countryIso(city, code) {
    if (code && ISO_BY_CODE[code]) return ISO_BY_CODE[code];
    var name = countryOf(city, code);
    var flip = { Sverige: "SE", Danmark: "DK", Norge: "NO", Finland: "FI", Nederländerna: "NL", Tyskland: "DE", Storbritannien: "GB", Frankrike: "FR", Spanien: "ES", Italien: "IT", Österrike: "AT", Schweiz: "CH", Belgien: "BE", Polen: "PL", Tjeckien: "CZ", Ungern: "HU", Turkiet: "TR", Grekland: "GR", Estland: "EE", Lettland: "LV", Litauen: "LT", Serbien: "RS", Bosnien: "BA", Nordmakedonien: "MK", Kosovo: "XK", Kroatien: "HR", Cypern: "CY" };
    return flip[name] || "";
  }

  function statusLabel(f) {
    if (f.statusSv) return f.statusSv;
    var c = String(f.status || "").toUpperCase();
    return STATUS_SV[c] || f.status || "";
  }

  function latestEvent(f) {
    var c = String(f.status || "").toUpperCase();
    if (c === "CAN") return "Inställd";
    if (c === "DEL") return "Borttagen";
    if (c === "RER" || c === "DIV") return "Omdirigerad";
    if (c === "FLS") return "Stoppad";
    if (f.lastBag) return "Sista bagage";
    if (f.firstBag) return "Första bagage";
    if (c === "LAN" || f.act) return f.dir === "AVG" ? "Avgånget" : "Landat";
    if (c === "ACT" || c === "SEQ" || c === "FPL") return "I luften";
    var when = parseIsoLocal(f.est || f.sched);
    if (when && Date.now() > when.getTime() + 8 * 60000 &&
        (c === "" || c === "SCH")) {
      return f.dir === "AVG" ? "Avgånget" : "Landat";
    }
    if (c === "SCH") return "Schemalagd";
    return statusLabel(f);
  }

  function kv(label, value) {
    var v = value || "—";
    return '<div class="feed-k">' + label + '</div><div class="feed-v">' + v + "</div>";
  }

  function flightToItem(f) {
    var when = parseIsoLocal(f.act || f.est || f.sched);
    var t = when ? fmtClock(when.toISOString()) : "--";
    var sched = parseIsoLocal(f.sched);
    var shown = parseIsoLocal(f.act || f.est || f.sched);
    var delay = "";
    var delayCls = "";
    if (sched && shown) {
      var mins = Math.round((shown - sched) / 60000);
      if (mins !== 0) {
        delay = (mins > 0 ? "+" : "") + mins + " min";
        delayCls = mins > 0 ? "late" : "early";
      }
    }
    var place = splitPlace(f.other || "");
    var city = place.city || "Landvetter";
    var code = inferApt(city, place.code || f.iata || "");
    var dk = destKey(city + " " + code);
    var bagTime = clockOf(f.firstBag) || clockOf(f.firstBagEst);
    var extra = '<div class="feed-kv">' +
      kv("Status", latestEvent(f)) +
      kv("Land", countryOf(city, code)) +
      kv("Gate", f.gate || "") +
      kv("Band", f.baggage || "") +
      kv("Väska", bagTime) +
      kv("Sista", clockOf(f.lastBag)) +
      (f.rawStatus ? kv("Info", f.rawStatus) : "") +
      "</div>";
    return {
      t: t,
      planT: sched ? "(" + fmtClock(sched.toISOString()) + ")" : "",
      delay: delay,
      delayCls: delayCls,
      type: "flyg",
      dir: f.dir || "ANK",
      title: (f.id || "Flyg") + (code ? " " + code : ""),
      city: city,
      cityLine: city + (countryIso(city, code) ? " " + countryIso(city, code) : ""),
      event: latestEvent(f),
      meta: city,
      extra: extra,
      tags: [dk, f.dir === "AVG" ? "flygAvgang" : "flygAnkomst"],
      live: true,
      sort: when ? when.getTime() : 0,
      dest: dk,
      apt: code,
      sid: "flyg:" + (f.id || "") + ":" + (f.dir || "") + ":" + (f.sched || t)
    };
  }


  var trainRouteCache = {};

