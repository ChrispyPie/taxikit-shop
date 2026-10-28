const TRIP_API_URL = 'https://lpfdryvukqmjlgenuzpb.supabase.co';
const TRIP_API_KEY = 'sb_publishable_7LwIOZ5ygRvJqJKFxl4cNQ_LvrzrHrP';
// Läge: 'driver' = Körpassdata (en förare), 'company' = Åkeridata (hela åkeriet).
// Åkeridata-sidan sätter window.TAXI_MODE = 'company' innan den här filen laddas.
const TAXI_MODE = window.TAXI_MODE || 'driver';
const COMPANY = TAXI_MODE === 'company';
// Bara ägaren får välja vilken förare han tittar på i Körpassdata (data per förare är personlig).
// Servern (get_trip_data) skickar bara andra förares data med förar-id till ägaren,
// så ingen annan kan se någon annans resor även om de skulle försöka.
const DRIVER_PICKER_ROLES = ['agare'];
let myRole = '';                   // inloggad roll (från servern)
let companyGoals = null;           // åkeriets mål per bil + antal registrerade bilar (från servern, sidan Bilar)
function isOwnerRole() { return myRole === 'agare'; }
let data = {};
let currentView = 'day';
let currentDate = new Date();
const TAB_KEY = COMPANY ? 'taxi_akeri_tab' : 'taxi_tab';
let currentTab = localStorage.getItem(TAB_KEY) || 'dag';
if (!['dag', 'vecka', 'manad', 'ar'].includes(currentTab)) currentTab = 'dag';
let lastTab = currentTab;          // fliken att gå tillbaka till efter egen period
let customRange = null;            // { from: Date, to: Date } när egen period är vald
let currentDriver = localStorage.getItem('taxi_driver') || '';
// Förare för rader utan förar-id: datasetets förare (servern skickar "forar" i svaret; demo får "Demoförare"), annars den inloggade.
function defForar() { return (data && data.forar) || currentDriver || ''; }
let viewDriver = currentDriver;    // föraren som visas (kan väljas av ägaren)
let driverNames = {};              // id -> namn (om servern ger namn)
let tripsByDriver = null;

const goals = { dag: 4000, vecka: 25000, manad: 100000, ar: 1200000 };
const typeMap = { '160': 'Kort', '283': 'Kredit', '163': 'Swish', '1': 'Kontant', '164': 'Uber', '161': 'Faktura', '185': 'Övrigt', '999': 'BOM' };
const weekdays = ['Sö', 'Må', 'Ti', 'On', 'To', 'Fr', 'Lö'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const UBER_FEE = 0.26;

async function tripRpc(name, args, timeoutMs) {
  // timeoutMs: avbryt anropet om servern inte svarat i tid (räknas som fel)
  const ctrl = timeoutMs && window.AbortController ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(TRIP_API_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': TRIP_API_KEY, 'Authorization': 'Bearer ' + TRIP_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ p_token: localStorage.getItem('taxi_session') || '' }, args || {})),
      signal: ctrl ? ctrl.signal : undefined
    });
  } finally { if (timer) clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let loadFailed = false;            // true när hämtningen misslyckats två gånger i rad
// "Försök igen"-knappen i felmeddelandet
async function retryLoadData(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Hämtar...'; }
  await loadData();
  render();
}

// ---- Snabbare sidbyten (t540u, 2026-10-28) ----
// 1) Förarsidorna hämtar bara egna pass och resor (get_my_trip_data). Ägaren får samma svar som förut.
//    Finns inte funktionen på servern används get_trip_data som förut.
// 2) Datan som redan hämtats återanvänds när man byter sida (bara i minnet, inte sparat i telefonen):
//    sidan visas direkt och uppdateras tyst i bakgrunden om datan är äldre än en minut.
// 3) Hämtningen startar i bakgrunden strax efter att menyn visats, så att Lönekoll/Körpassdata är klara när man trycker.
// 4) Samtidiga hämtningar delar på samma anrop.
const DATA_FRESH_MS = 60 * 1000;          // yngre än så: ingen ny hämtning alls
const DATA_REUSE_MS = 15 * 60 * 1000;     // yngre än så: visa direkt och uppdatera i bakgrunden
let dataLoadedAt = 0;
let dataSession = '';
let loadPromise = null;
let myTripApiMissing = false;
function dataReusable() {
  return !COMPANY && !loadFailed && data && data.shifts && dataLoadedAt &&
    dataSession === (localStorage.getItem('taxi_session') || '') && Date.now() - dataLoadedAt < DATA_REUSE_MS;
}
async function fetchTripData() {
  if (!COMPANY && !myTripApiMissing) {
    try { return await tripRpc('get_my_trip_data', { p_dataset: 'current' }, 20000); }
    catch (e) { if (e && e.message === 'HTTP 404') myTripApiMissing = true; else throw e; }
  }
  return await tripRpc('get_trip_data', { p_dataset: 'current' }, 20000);
}
// Hämtar på nytt i bakgrunden om datan är äldre än en minut. Svarar true när ny data har kommit.
window.taxiRefreshData = function () {
  if (COMPANY || !dataReusable() || Date.now() - dataLoadedAt < DATA_FRESH_MS) return Promise.resolve(false);
  return loadData(true).then(() => !loadFailed, () => false);
};
function loadData(force) {
  if (!force && dataReusable()) {
    if (Date.now() - dataLoadedAt >= DATA_FRESH_MS && !loadPromise)
      window.taxiRefreshData().then(ok => { if (ok && dashboardVisible()) render(); });
    return Promise.resolve();
  }
  if (!loadPromise) loadPromise = loadDataNow(!!force && dataReusable()).finally(() => { loadPromise = null; });
  return loadPromise;
}
function dashboardVisible() {
  const el = document.getElementById('dashboard-view');
  return !!el && !el.classList.contains('hidden');
}
// Förhämtning: när menyn visas (inloggad förare) hämtas förarens data i bakgrunden.
// Inte för ägaren (hela åkeriets resor) och inte på Åkeridata-sidan.
if (!COMPANY) setTimeout(function prefetch() {
  if (!localStorage.getItem('taxi_session') || dataReusable() || loadPromise) return;
  const cat = (window.driverData && window.driverData.category) || '';
  if (!cat) { if (!prefetch.n) { prefetch.n = 1; setTimeout(prefetch, 1500); } return; }   // get_me har inte svarat än
  if (cat === 'agare') return;
  loadData().catch(() => {});
}, 1200);

async function loadDataNow(keepOld) {
  const sessionAtStart = localStorage.getItem('taxi_session') || '';
  currentDriver = localStorage.getItem('taxi_driver') || '';
  if (!keepOld) viewDriver = currentDriver;   // bakgrundsuppdatering: behåll vald förare tills väljaren byggts om
  if (companyUseApi()) {
    // Åkeridata: ingen helårsnedladdning. Siffrorna hämtas per vald period (companyPeriod nedan).
    data = {};
    loadFailed = false;
    companyApi.cache.clear(); companyApi.failed = {}; companyApi.trips = {}; companyApi.tripsFailed = {};
  } else try {
    // Resedata hämtas från servern (Supabase) och kräver inloggning.
    // Förare får bara sina egna resor; inga publika datafiler används.
    // Ett automatiskt nytt försök om anropet misslyckas (HTTP-fel, timeout eller nätverksfel).
    // Misslyckas även det visas ett felmeddelande med "Försök igen" i stället för nollor.
    let res;
    try { res = await fetchTripData(); }
    catch (e1) {
      await new Promise(r => setTimeout(r, 1500));
      res = await fetchTripData();
    }
    data = res || {};
    loadFailed = false;
    dataLoadedAt = Date.now();
    dataSession = sessionAtStart;
    archiveMergeInto(data);   // äldre år som redan hämtats i den här sessionen (bara i minnet)
    dedupData(data);
  } catch (e) {
    if (keepOld) return;   // bakgrundsuppdatering misslyckades: behåll det som redan visas
    data = {};
    loadFailed = true;   // tom månad (inga resor) är INTE ett fel – då visas 0 som vanligt
  }
  tripsByDriver = null;
  orphanTrips = null;
  if (!myRole) {
    myRole = (window.driverData && window.driverData.category) || '';
    if (!myRole) { try { const me = await tripRpc('get_me'); myRole = (me && me.category) || ''; } catch (e) {} }
  }
  if (COMPANY) {
    // Förarnamn bara för ägaren; övriga får inga förar-id från servern.
    if (isOwnerRole()) await loadDriverNames();
    try { companyGoals = await tripRpc('get_company_goals'); } catch (e) { companyGoals = null; }
  } else await setupDriverPicker();
}

// Hämtar förarnamn (servern ger bara namn till roller som får se dem)
async function loadDriverNames() {
  try {
    const rows = await tripRpc('admin_list_drivers');
    if (Array.isArray(rows)) rows.forEach(r => {
      const n = ((r.first_name || '') + ' ' + (r.last_name || '')).trim();
      driverNames[r.id] = window.shortNameParts ? shortNameParts(r.first_name, r.last_name) : n;   // "Christian P", se namn.js
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e) { return []; }
}

function driverLabel(id) {
  const n = driverNames[id];
  return n ? id + ' – ' + n : id;
}

// Ägaren får en väljare i Körpassdata för att titta på valfri förare.
async function setupDriverPicker() {
  const label = document.getElementById('driver-label');
  if (!label) return;
  if (!DRIVER_PICKER_ROLES.includes(myRole)) {
    viewDriver = currentDriver;
    return;
  }
  const rows = await loadDriverNames();
  const ids = new Set([currentDriver]);
  rows.forEach(r => { if (r.id) ids.add(r.id); });
  (data.shifts || []).forEach(s => ids.add(s.forar || defForar()));
  (data.trips || []).forEach(t => ids.add(t.forar || defForar()));
  const sorted = Array.from(ids).filter(Boolean).sort();
  const saved = sessionStorage.getItem('taxi_view_driver_' + currentDriver);
  viewDriver = saved && sorted.includes(saved) ? saved : currentDriver;
  label.innerHTML = '<select id="driver-select" aria-label="Välj förare">' +
    sorted.map(id => `<option value="${escHtml(id)}"${id === viewDriver ? ' selected' : ''}>${escHtml(driverLabel(id))}</option>`).join('') +
    '</select>';
  document.getElementById('driver-select').onchange = e => {
    viewDriver = e.target.value;
    sessionStorage.setItem('taxi_view_driver_' + currentDriver, viewDriver);
    render();
  };
}

function matchDriver(rec) {
  return COMPANY || (rec.forar || defForar()) === viewDriver;
}

function goHome() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  currentView = 'day';
  currentDate = new Date();
  render();
}
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('driver-label').textContent = currentDriver;
  syncTabs();
  loadData().then(render);
}

// Inloggning och utloggning sköts i index.html via server-funktioner (RPC).
const pwEl = document.getElementById('password');
if (pwEl) pwEl.addEventListener('keypress', e => {
  if (e.key === 'Enter') checkPassword();
});
const idEl = document.getElementById('driver-id');
if (idEl) idEl.addEventListener('keypress', e => {
  if (e.key === 'Enter') document.getElementById('password').focus();
});
function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function isToday(d) {
  return d.toDateString() === new Date().toDateString();
}

function isCurrentPeriod() {
  const now = new Date();
  if (currentTab === 'period') return !!customRange && customRange.to >= startOfDay(now);
  if (currentTab === 'dag') return isToday(currentDate);
  if (currentTab === 'vecka') return getWeekNumber(currentDate) === getWeekNumber(now) && currentDate.getFullYear() === now.getFullYear();
  if (currentTab === 'ar') return currentDate.getFullYear() === now.getFullYear();
  return currentDate.getMonth() === now.getMonth() && currentDate.getFullYear() === now.getFullYear();
}

function formatSEK(n) {
  return new Intl.NumberFormat('sv-SE').format(Math.round(n || 0)) + ' kr';
}

function parseAmount(str) {
  return parseFloat((str || '0').replace(/\s/g, '').replace(',', '.')) || 0;
}

function parseShiftTime(str) {
  const parts = (str || '').split(' ');
  if (parts.length < 2) return null;
  const d = parts[0];
  const t = parts[1].replace(/ /g, '');
  return new Date(d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6,8) + 'T' + t);
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

function getWeekEnd(date) {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23,59,59,999);
  return end;
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

function getRemainingDays(date) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const end = getMonthEnd(date);
  if (today > end) return 0;
  const diff = Math.ceil((end - today) / 86400000);
  return Math.max(0, diff);
}

function getRemainingShifts(date, tab) {
  const today = new Date();
  today.setHours(0,0,0,0);
  if (tab === 'vecka') {
    const weekEnd = getWeekEnd(date);
    if (today > weekEnd) return 0;
    const dayOfWeek = today.getDay();
    const daysLeft = dayOfWeek === 0 ? 1 : 7 - dayOfWeek + 1;
    return daysLeft;
  }
  if (tab === 'manad') {
    return getRemainingDays(date);
  }
  if (tab === 'ar') {
    const end = new Date(date.getFullYear(), 11, 31);
    if (today > end) return 0;
    return Math.round((end - today) / 86400000) + 1;
  }
  return 0;
}


function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function ddmm(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000) + 1; }

// Tidsintervallet som visas just nu (dag, vecka, månad eller egen period)
function getRange() {
  if (currentTab === 'period' && customRange) return [startOfDay(customRange.from), endOfDay(customRange.to)];
  if (currentTab === 'vecka') return [getWeekStart(currentDate), getWeekEnd(currentDate)];
  if (currentTab === 'manad') return [getMonthStart(currentDate), getMonthEnd(currentDate)];
  if (currentTab === 'ar') return [new Date(currentDate.getFullYear(), 0, 1), new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59)];
  return [startOfDay(currentDate), endOfDay(currentDate)];
}

function getShiftsInRange(start, end) {
  return (data.shifts || []).filter(s => {
    if (!matchDriver(s)) return false;
    const shiftStart = parseShiftTime(s.start);
    return shiftStart && shiftStart >= start && shiftStart <= end;
  });
}

function getTripsForShift(shift) {
  if (!shift) return [];
  const shiftStart = parseShiftTime(shift.start);
  const shiftEnd = parseShiftTime(shift.slut);
  if (!shiftStart || !shiftEnd) return [];

  // Resorna kopplas till skiftets egen förare (fungerar både för en förare och hela åkeriet)
  const shiftDriver = shift.forar || defForar();
  if (!tripsByDriver) {
    tripsByDriver = {};
    (data.trips || []).forEach(t => { const f = t.forar || defForar(); (tripsByDriver[f] = tripsByDriver[f] || []).push(t); });
  }
  return (tripsByDriver[shiftDriver] || []).filter(t => {
    const tripDate = t.startdatum;
    const tripTime = t.starttid;
    if (!tripDate || !tripTime) return false;
    const tripDt = new Date(tripDate + 'T' + tripTime);
    return tripDt >= shiftStart && tripDt <= shiftEnd;
  });
}

// Resor som inte ligger i något av förarens pass (t.ex. när ett pass saknas i passrapporten).
// De räknas på resans eget datum och tid, precis som i Topplistor, så att inget inkört försvinner.
let orphanTrips = null;
function tripTime(t) {
  if (!t.startdatum || !t.starttid) return null;
  const d = new Date(t.startdatum + 'T' + t.starttid);
  return isNaN(d) ? null : d;
}
function getOrphanTripsInRange(start, end) {
  if (!orphanTrips) {
    const byDriver = {};
    (data.shifts || []).forEach(s => {
      const a = parseShiftTime(s.start), b = parseShiftTime(s.slut);
      if (a && b && !isNaN(a) && !isNaN(b)) (byDriver[s.forar || defForar()] = byDriver[s.forar || defForar()] || []).push([a, b]);
    });
    orphanTrips = (data.trips || []).filter(t => {
      const ts = tripTime(t);
      return ts && !(byDriver[t.forar || defForar()] || []).some(r => ts >= r[0] && ts <= r[1]);
    });
  }
  return orphanTrips.filter(t => {
    if (!matchDriver(t)) return false;
    const ts = tripTime(t);
    return ts >= start && ts <= end;
  });
}

function sumByType(trips, typeCode) {
  return trips.filter(t => t.kredittyp === typeCode).reduce((s, t) => s + parseAmount(t.belopp), 0);
}

function parseTime(tid) {
  if (!tid) return 0;
  const parts = tid.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h + ':' + String(m).padStart(2, '0');
}

function formatShiftDate(str) {
  const parts = (str || '').split(' ');
  if (!parts[0] || parts[0].length < 8) return '';
  const d = parts[0];
  return d.slice(6,8) + '/' + d.slice(4,6);
}
function tripDetailRows(t, cls) {
  return `<div class="sub ${cls}"><span>Start</span><span>${t.starttid || '00:00'} – zon ${t.startzon || '?'}</span></div>
          <div class="sub ${cls}"><span>Slut</span><span>${t.sluttid || '00:00'} – zon ${t.slutzon || '?'}</span></div>
          <div class="sub ${cls}"><span>Betalt</span><span>${formatSEK(parseAmount(t.belopp))}</span></div>
          <div class="sub ${cls}"><span>Typ</span><span>${typeMap[t.kredittyp] || t.kredittyp || '?'}</span></div>
          <div class="sub ${cls}"><span>Dricks</span><span>${formatSEK(parseAmount(t.dricks))}</span></div>`;
}

// En rad i skiftlistan med resor som inte hör till något pass
function looseTripsRow(list) {
  list = list.slice().sort((a, b) => ((b.startdatum || '') + (b.starttid || '')).localeCompare((a.startdatum || '') + (a.starttid || '')));
  const uber = list.filter(t => t.kredittyp === '164').reduce((sum, t) => sum + parseAmount(t.belopp), 0);
  const other = list.filter(t => t.kredittyp !== '999' && t.kredittyp !== '164').reduce((sum, t) => sum + parseAmount(t.belopp), 0);
  const tripsHtml = list.map(t => {
    const isBom = t.kredittyp === '999';
    const dd = (t.startdatum || '').slice(8, 10) + '/' + (t.startdatum || '').slice(5, 7);
    return `<div class="sub shift-trip" data-key="lt:${escHtml(t.kvittonr)}|${escHtml(t.forar || defForar())}|${escHtml(t.startdatum || '')}" onclick="toggleTrip(this, event)" style="${isBom ? 'opacity:0.6;' : ''}"><span class="toggle">+</span><span>${dd} ${escHtml(t.kvittonr)}${isBom ? ' (BOM)' : ''}</span><span>${formatSEK(parseAmount(t.belopp))}</span></div>
          <div class="sub trip-detail"><span>Start</span><span>${t.starttid || '00:00'} – zon ${t.startzon || '?'}</span></div>
          <div class="sub trip-detail"><span>Slut</span><span>${t.sluttid || '00:00'} – zon ${t.slutzon || '?'}</span></div>
          <div class="sub trip-detail"><span>Typ</span><span>${typeMap[t.kredittyp] || t.kredittyp || '?'}</span></div>
          <div class="sub trip-detail"><span>Dricks</span><span>${formatSEK(parseAmount(t.dricks))}</span></div>`;
  }).join('');
  return `<div class="stat-row" data-key="loose" onclick="toggleShift(this)"><span class="toggle">+</span><span class="label">Resor utan pass (${list.length} st)</span><span class="value">${formatSEK(other + uber * (1 - UBER_FEE))}</span></div>
      <div class="shift-content">${tripsHtml}</div>`;
}

function render() {
  try {
  const isTodayNow = isToday(currentDate);
  const isCurrent = isCurrentPeriod();
  const isPeriod = currentTab === 'period' && !!customRange;
  const dateEl = document.getElementById('current-date');
  const yy = String(currentDate.getFullYear()).slice(-2);

  if (isPeriod) {
    const f = customRange.from, t = customRange.to;
    const ty = String(t.getFullYear()).slice(-2);
    dateEl.textContent = f.toDateString() === t.toDateString()
      ? weekdays[f.getDay()] + ' ' + ddmm(f) + '-' + ty
      : ddmm(f) + (f.getFullYear() !== t.getFullYear() ? '-' + String(f.getFullYear()).slice(-2) : '') + ' – ' + ddmm(t) + '-' + ty;
  } else if (currentTab === 'dag') {
    const wd = weekdays[currentDate.getDay()];
    dateEl.textContent = wd + ' ' + ddmm(currentDate) + '-' + yy;
  } else if (currentTab === 'vecka') {
    const wn = getWeekNumber(currentDate);
    dateEl.textContent = 'V' + wn + ' -' + yy;
  } else if (currentTab === 'ar') {
    dateEl.textContent = 'År ' + currentDate.getFullYear();
  } else {
    dateEl.textContent = months[currentDate.getMonth()] + ' -' + yy;
  }
  dateEl.classList.toggle('period', isPeriod);
  syncTabs();

  document.getElementById('today').classList.toggle('active', isTodayNow && currentTab === 'dag');
  const periodBtn = document.getElementById('period-btn');
  if (periodBtn) periodBtn.classList.toggle('active', isPeriod);
  document.getElementById('next').disabled = isCurrent;
  document.getElementById('next').style.opacity = isCurrent ? '0.3' : '1';

  if (data.last_updated) {
    // Tidpunkt då servern senast hämtades utan fel, i svensk tid
    const when = window.fmtSthlmTime ? fmtSthlmTime(data.last_updated)
      : new Date(data.last_updated).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-updated').textContent = 'Senast hämtad från servern ' + when;
  }

  if (loadFailed) {
    document.getElementById('dashboard').style.opacity = ''; document.getElementById('dashboard').setAttribute('aria-busy', 'false');
    document.getElementById('dashboard').innerHTML =
      '<div class="section load-error" role="alert" style="text-align:center;padding:24px 16px;">' +
      '<div style="font-weight:600;margin-bottom:6px;">Kunde inte hämta data – försök igen</div>' +
      '<div style="opacity:.75;font-size:.9em;margin-bottom:14px;">Servern svarade inte. Dina körningar finns kvar.</div>' +
      '<button type="button" class="retry-btn" onclick="retryLoadData(this)" style="padding:10px 22px;border-radius:999px;border:2px solid var(--primary);background:var(--primary);color:var(--on-primary,#fff);font-weight:600;font-size:1em;">Försök igen</button>' +
      '</div>';
    return;
  }

  const [rangeStart, rangeEnd] = getRange();
  // Åkeridata: perioden hämtas färdigräknad från servern (get_company_period). Medan den hämtas visas
  // förra bilden lite nedtonad (eller "Hämtar…" första gången).
  let P = null;
  if (companyUseApi()) {
    const cp = companyPeriod(rangeStart, rangeEnd);
    const dashEl = document.getElementById('dashboard');
    if (!cp.res) {
      if (cp.html) dashEl.innerHTML = cp.html; else dashEl.style.opacity = '0.55';
      dashEl.setAttribute('aria-busy', cp.html ? 'false' : 'true');
      return;
    }
    P = cp.res;
  }
  // Data visas nu (från servern eller reservvägen get_trip_data): ta alltid bort nedtoningen.
  { const d = document.getElementById('dashboard'); d.style.opacity = ''; d.setAttribute('aria-busy', 'false'); }
  let shifts = getShiftsInRange(rangeStart, rangeEnd);
  if (P) shifts = P.shifts.slice();
  shifts.sort((a, b) => (b.start || '').localeCompare(a.start || ''));

  let allTrips = [];
  let totalMinutes = 0;
  shifts.forEach(s => {
    allTrips = allTrips.concat(getTripsForShift(s));
    totalMinutes += parseTime(s.tid);
  });
  if (P) totalMinutes = Number(P.totals.minutes) || 0;
  const looseTrips = P ? P.loose : getOrphanTripsInRange(rangeStart, rangeEnd);
  allTrips = allTrips.concat(looseTrips);
  if (currentTab === 'dag' && !COMPANY) allTrips.sort((a, b) => ((a.startdatum || '') + (a.starttid || '')).localeCompare((b.startdatum || '') + (b.starttid || '')));

  const trips = allTrips.filter(t => t.kredittyp !== '999');
  const S = P ? P.totals : null;   // Åkeridata: summorna kommer från servern (samma regler som nedan)
  const antal = S ? Number(S.antal) : trips.length;
  const totalKm = S ? Number(S.km) : shifts.reduce((s, sh) => s + parseFloat((sh.km || '0').replace(',', '.')), 0);
  const arbetad = formatTime(totalMinutes);
  const antalSkift = shifts.length;
  const akS = P && P.scope ? P.scope : 'akeri';   // Åkeridata: vald väljare (akeri/bil/forare)
  const antalForare = akS === 'bil' && P.breakdown ? P.breakdown.length : new Set(shifts.map(s => s.forar || defForar())).size;
  const antalBilar = akS === 'forare' && P.breakdown ? P.breakdown.length : new Set(shifts.map(s => s.taxi).filter(Boolean)).size;

  const kort = S ? Number(S.kort) : sumByType(trips, '160');
  const kredit = S ? Number(S.kredit) : sumByType(trips, '283');
  const swish = S ? Number(S.swish) : sumByType(trips, '163');
  const kontant = S ? Number(S.kontant) : sumByType(trips, '1');
  const uberGross = S ? Number(S.uber) : sumByType(trips, '164');
  const uberNetto = uberGross * (1 - UBER_FEE);
  const faktura = S ? Number(S.faktura) : sumByType(trips, '161');
  const ovrigt = S ? Number(S.ovrigt) : sumByType(trips, '185');
  const bom = S ? Number(S.bom) : sumByType(allTrips, '999');
  const dricks = S ? Number(S.dricks) : trips.reduce((s, t) => s + parseAmount(t.dricks), 0);

  const inkort = kort + kredit + swish + kontant + uberNetto + faktura + ovrigt;
  const krPerKorning = antal ? Math.round(inkort / antal) : 0;
  const krPerMil = totalKm ? Math.round(inkort / (totalKm / 10)) : 0;
  const krPerTimme = totalMinutes ? Math.round(inkort / (totalMinutes / 60)) : 0;
  const goalTab = isPeriod ? 'dag' : currentTab;
  // Åkeriet: mål per bil × antal bilar. Egen period: dagsmålet × antal dagar.
  const periodDays = isPeriod ? daysBetween(customRange.from, customRange.to) : 1;
  const perCar = companyGoals ? (goalTab === 'ar' ? companyGoals.per_car_month * 12 : goalTab === 'manad' ? companyGoals.per_car_month : goalTab === 'vecka' ? companyGoals.per_car_week : companyGoals.per_car_day) : 0;
  // Bil: målet för en bil. Chaufför: inget mål (målen gäller per bil).
  const goalCars = akS === 'bil' ? 1 : (companyGoals ? companyGoals.cars : 0);
  const goal = COMPANY ? perCar * goalCars * periodDays : (goals[goalTab] || 4000);
  const diff = inkort - goal;
  const inkortPerSkift = antalSkift ? Math.round(inkort / antalSkift) : 0;
  const remaining = Math.max(0, goal - inkort);
  const remainingShifts = getRemainingShifts(currentDate, currentTab);
  const behovPerSkift = remainingShifts > 0 ? Math.round(remaining / remainingShifts) : 0;
  const diffColor = diff >= 0 ? 'var(--c-38a169)' : 'var(--c-e53e3e)';
  // Förare: Mål/Diff per dag/vecka/månad (inte för egen period).
  // Åkeriet: Mål/Diff alltid när målen kunde hämtas (egen period = dagsmål × dagar).
  // Antal bilar = bilar registrerade under Bilar (admin). 0 bilar => tips i stället för mål 0.
  const noCars = COMPANY && akS === 'akeri' && !!companyGoals && !(companyGoals.cars > 0);
  const showGoal = COMPANY ? !!companyGoals && !noCars && akS !== 'forare' : !isPeriod;
  const remainingDays = COMPANY && !isPeriod && currentTab !== 'dag' && isCurrent ? getRemainingShifts(currentDate, currentTab) : 0;

  let timmarSubs = '';
  if (COMPANY || isPeriod || currentTab !== 'dag' || shifts.length > 1) {
    timmarSubs = `
      <div class="sub"><span>Antal skift</span><span>${antalSkift} st</span></div>`;
    if (COMPANY && (akS === 'bil' || (akS === 'akeri' && isOwnerRole()))) timmarSubs += `
      <div class="sub"><span>Antal förare</span><span>${antalForare} st</span></div>`;
    if (COMPANY && akS !== 'bil') timmarSubs += `
      <div class="sub"><span>Antal bilar</span><span>${antalBilar} st</span></div>`;
    timmarSubs += `
      <div class="sub"><span>Kr/timme</span><span>${formatSEK(krPerTimme)}</span></div>`;
    if (!showGoal) timmarSubs += `
      <div class="sub"><span>Inkört/skift</span><span>${formatSEK(inkortPerSkift)}</span></div>`;
  } else if (!isTodayNow && shifts.length) {
    const s = shifts[0];
    const startTid = (s.start || '').split(' ')[1] || '00:00';
    const slutTid = (s.slut || '').split(' ')[1] || '00:00';
    timmarSubs = `
      <div class="sub"><span>Start</span><span>${startTid}</span></div>
      <div class="sub"><span>Slut</span><span>${slutTid}</span></div>
      <div class="sub"><span>Kr/timme</span><span>${formatSEK(krPerTimme)}</span></div>`;
  }

  let diffSubs = '';
  if (COMPANY) {
    if (isPeriod || currentTab !== 'dag') diffSubs = `
      <div class="sub"><span>Inkört/skift</span><span>${formatSEK(inkortPerSkift)}</span></div>`;
    if (remainingDays > 0) diffSubs += `
      <div class="sub"><span>Behov/dag</span><span>${formatSEK(Math.round(remaining / remainingDays))}</span></div>`;
  } else if (currentTab !== 'dag' && isCurrent && remainingShifts > 0) {
    diffSubs = `
      <div class="sub"><span>Inkört/skift</span><span>${formatSEK(inkortPerSkift)}</span></div>
      <div class="sub"><span>Behov/skift</span><span>${formatSEK(behovPerSkift)}</span></div>`;
  } else if (currentTab !== 'dag') {
    diffSubs = `
      <div class="sub"><span>Inkört/skift</span><span>${formatSEK(inkortPerSkift)}</span></div>`;
  }

  // Alla betalsätt visas alltid, även när beloppet är 0 kr
  const paymentSubs = `
    <div class="sub"><span>Kort</span><span>${formatSEK(kort)}</span></div>
    <div class="sub"><span>Kredit</span><span>${formatSEK(kredit)}</span></div>
    <div class="sub" style="opacity:0.5;"><span>Uber</span><span>${formatSEK(uberGross)}</span></div>
    <div class="sub"><span>Uber netto</span><span>${formatSEK(uberNetto)}</span></div>
    <div class="sub"><span>Kontant</span><span>${formatSEK(kontant)}</span></div>
    <div class="sub"><span>Swish</span><span>${formatSEK(swish)}</span></div>
    <div class="sub"><span>Faktura</span><span>${formatSEK(faktura)}</span></div>
    <div class="sub"><span>Övrigt</span><span>${formatSEK(ovrigt)}</span></div>
    <div class="sub" style="opacity:0.5;"><span>BOM</span><span>${formatSEK(bom)}</span></div>
    <div class="sub" style="opacity:0.5;"><span>Dricks</span><span>${formatSEK(dricks)}</span></div>`;

  let html = `<div class="section">
    <div class="stat-row" data-key="timmar" onclick="toggle(this)"><span class="toggle">+</span><span class="label">Arbetade timmar</span><span class="value">${arbetad}</span></div>
    ${timmarSubs}
    <div class="stat-row" data-key="km" onclick="toggle(this)"><span class="toggle">+</span><span class="label">Körda km</span><span class="value">${totalKm.toFixed(1)} km</span></div>
    <div class="sub"><span>Kr/mil</span><span>${formatSEK(krPerMil)}</span></div>
    <div class="stat-row" data-key="antal" onclick="toggle(this)"><span class="toggle">+</span><span class="label">Antal körningar</span><span class="value">${antal} st</span></div>
    <div class="sub"><span>Kr/körning</span><span>${formatSEK(krPerKorning)}</span></div>
    <div class="stat-row" data-key="inkort" onclick="toggle(this)"><span class="toggle">+</span><span class="label">Inkört</span><span class="value">${formatSEK(inkort)}</span></div>
    ${paymentSubs}`;
  if (noCars) html += `
    <div class="stat-row" id="goal-row" onclick="location.href='admin.html#bilar'"><span class="toggle"></span><span class="label">Mål</span><span class="value goal-hint">Lägg in bilar under Bilar</span></div>`
    + (isOwnerRole() && companyGoals.can_edit ? `
    <div class="sub visible" onclick="openGoalModal()" style="cursor:pointer;"><span>Mål per bil ✎</span><span>${formatSEK(perCar)}</span></div>` : '');
  if (showGoal && COMPANY) {
    // Ägaren trycker på Mål för att ändra; övriga kan fälla ut och se hur målet räknas.
    const canEdit = isOwnerRole() && companyGoals.can_edit;
    const carsTxt = goalCars === 1 ? '1 bil' : goalCars + ' bilar';
    const how = isPeriod ? `${formatSEK(companyGoals.per_car_day)} × ${carsTxt} × ${periodDays} dagar` : `${formatSEK(perCar)} × ${carsTxt}`;
    html += canEdit
      ? `<div class="stat-row" id="goal-row" onclick="openGoalModal()"><span class="toggle">✎</span><span class="label">Mål</span><span class="value" style="border-bottom: 1px solid var(--c-cbd5e0); padding-bottom: 2px;">− ${formatSEK(goal)}</span></div>
    <div class="sub visible"><span>Per bil</span><span>${how}</span></div>`
      : `<div class="stat-row" id="goal-row" data-key="mal" onclick="toggle(this)"><span class="toggle">+</span><span class="label">Mål</span><span class="value" style="border-bottom: 1px solid var(--c-cbd5e0); padding-bottom: 2px;">− ${formatSEK(goal)}</span></div>
    <div class="sub"><span>Per bil</span><span>${how}</span></div>`;
  } else if (showGoal) html += `
    <div class="stat-row" onclick="editGoal()"><span class="toggle"></span><span class="label">Mål</span><span class="value" style="border-bottom: 1px solid var(--c-cbd5e0); padding-bottom: 2px;">− ${formatSEK(goal)}</span></div>`;
  if (showGoal) html += `
    <div class="stat-row" data-key="diff" onclick="toggle(this)"><span class="toggle">${diffSubs ? '+' : ''}</span><span class="label">Diff</span><span class="value" style="color:${diffColor}; font-weight:700;">${formatSEK(diff)}</span></div>
    ${diffSubs}`;
  html += `</div>`;
  html += akBreakdownHtml(P);

  if (currentTab === 'dag' && !COMPANY) {
    // En förares dag: lista med alla körningar
    if (allTrips.length) {
      html += `<div class="section">${allTrips.map(t => {
        const isBom = t.kredittyp === '999';
        return `<div class="stat-row" data-key="trip:${escHtml(t.kvittonr)}|${escHtml(t.forar || defForar())}|${escHtml(t.startdatum || '')}" onclick="toggle(this)" style="${isBom ? 'opacity:0.6;' : ''}"><span class="toggle">+</span><span class="label">${escHtml(t.kvittonr)}${isBom ? ' (BOM)' : ''}</span><span class="value">${formatSEK(parseAmount(t.belopp))}</span></div>
        ${tripDetailRows(t, '')}`;
      }).join('')}</div>`;
    }
  } else if (shifts.length) {
    // Lista med skift (för hela åkeriet även på dagsfliken: ett skift per förare och bil)
    html += `<div class="section">${shifts.map(s => {
      // Åkeridata: passets resor följer med för korta perioder, annars hämtas de när passet fälls ut.
      const lazyId = P && !s._trips ? s._id : null;
      const shiftTrips = P ? (s._trips || companyApi.trips[s._id] || []) : getTripsForShift(s);
      const shiftUber = shiftTrips.filter(t => t.kredittyp === '164').reduce((sum, t) => sum + parseAmount(t.belopp), 0);
      const shiftOther = shiftTrips.filter(t => t.kredittyp !== '999' && t.kredittyp !== '164').reduce((sum, t) => sum + parseAmount(t.belopp), 0);
      const shiftInkort = P ? s._inkort : shiftOther + shiftUber * (1 - UBER_FEE);
      const dateLabel = (COMPANY && currentTab === 'dag') ? '' : formatShiftDate(s.start) + ' ';
      // Förare visas bara för ägaren; övriga ser bara bilen
      const who = COMPANY ? `<span class="shift-who">${escHtml(s.taxi || '?')}${isOwnerRole() ? ' · ' + escHtml(driverLabel(s.forar || defForar())) : ''}</span>` : '';
      const tripsHtml = shiftTrips.map(t => {
        const isBom = t.kredittyp === '999';
        return `<div class="sub shift-trip" data-key="st:${escHtml(t.kvittonr)}|${escHtml(t.forar || defForar())}|${escHtml(t.startdatum || '')}" onclick="toggleTrip(this, event)" style="${isBom ? 'opacity:0.6;' : ''}"><span class="toggle">+</span><span>${escHtml(t.kvittonr)}${isBom ? ' (BOM)' : ''}</span><span>${formatSEK(parseAmount(t.belopp))}</span></div>
          <div class="sub trip-detail"><span>Start</span><span>${t.starttid || '00:00'} – zon ${t.startzon || '?'}</span></div>
          <div class="sub trip-detail"><span>Slut</span><span>${t.sluttid || '00:00'} – zon ${t.slutzon || '?'}</span></div>
          <div class="sub trip-detail"><span>Typ</span><span>${typeMap[t.kredittyp] || t.kredittyp || '?'}</span></div>
          <div class="sub trip-detail"><span>Dricks</span><span>${formatSEK(parseAmount(t.dricks))}</span></div>`;
      }).join('') + (lazyId != null && !companyApi.trips[lazyId] ? companyTripsPlaceholder(lazyId) : '');
      return `<div class="stat-row" data-key="shift:${escHtml(s.passnr)}|${escHtml(s.forar || defForar())}|${escHtml(s.start || '')}"${lazyId != null && !companyApi.trips[lazyId] ? ` data-lazy="${lazyId}"` : ''} onclick="toggleShift(this)"><span class="toggle">+</span><span class="label">${dateLabel}#${escHtml(s.passnr)}${who}</span><span class="value">${formatSEK(shiftInkort)}</span></div>
      <div class="shift-content">${tripsHtml}</div>`;
    }).join('')}${looseTrips.length ? looseTripsRow(looseTrips) : ''}</div>`;
  } else if (looseTrips.length) {
    html += `<div class="section">${looseTripsRow(looseTrips)}</div>`;
  }

  // äldre år: hämtas automatiskt, bara för perioder före i år (Åkeridata: servern har redan arkivet med)
  const ark = P ? { hide: false, html: rangeStart.getFullYear() < new Date().getFullYear() ? `<div class="arkiv-tag">📦 Äldre data från arkivet</div>` : '' }
    : archiveStatus(rangeStart, rangeEnd);
  html = ark.html + (ark.hide ? '' : html);

  const dash = document.getElementById('dashboard');
  dash.innerHTML = html;
  restoreOpen(dash);
  if (P) companyLoadTrips(Array.from(dash.querySelectorAll('.stat-row.open[data-lazy]'))
    .map(el => el.dataset.lazy).filter(id => !companyApi.tripsFailed[id]));
  if (!COMPANY) document.dispatchEvent(new CustomEvent('taxidata:render'));

  } catch (e) {
    const el = document.getElementById('dashboard') || document.getElementById('content');
    if (el) el.textContent = 'Fel: ' + e.message;
  }
}

// Hjälpboten läser riktiga siffror härifrån (samma beräkning som Inkört/Mål ovan, bara läsning).
// tab: 'dag' | 'vecka' | 'manad' | 'ar'. Returnerar null om ingen data är hämtad ännu.
window.taxiStats = function (tab) {
  if (COMPANY || !data || !data.shifts) return null;
  tab = tab || 'dag';
  const now = new Date();
  const range = tab === 'vecka' ? [getWeekStart(now), getWeekEnd(now)]
    : tab === 'manad' ? [getMonthStart(now), getMonthEnd(now)]
    : tab === 'ar' ? [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31, 23, 59, 59)] : [startOfDay(now), endOfDay(now)];
  const shifts = getShiftsInRange(range[0], range[1]);
  let trips = [];
  shifts.forEach(s => { trips = trips.concat(getTripsForShift(s)); });
  trips = trips.concat(getOrphanTripsInRange(range[0], range[1]));
  trips = trips.filter(t => t.kredittyp !== '999');
  const inkort = ['160', '283', '163', '1', '161', '185'].reduce((a, c) => a + sumByType(trips, c), 0)
    + sumByType(trips, '164') * (1 - UBER_FEE);
  const goal = goals[tab] || goals.dag;
  return { tab, inkort: Math.round(inkort), goal, diff: Math.round(inkort - goal), antal: trips.length,
           skift: shifts.length, own: viewDriver === currentDriver, viewing: currentTab, viewingCurrent: isCurrentPeriod() };
};
// Lönekoll läser förarens pass och resor (inklusive BOM) för en period härifrån, bara läsning.
// Pass väljs på passets startdatum, resor utan pass på resans eget datum (som Inkört ovan).
window.taxiPayData = function (from, to) {
  if (COMPANY || !data || !data.shifts) return null;
  const shifts = getShiftsInRange(from, to);
  let trips = [];
  shifts.forEach(s => { trips = trips.concat(getTripsForShift(s)); });
  trips = trips.concat(getOrphanTripsInRange(from, to));
  return { driver: viewDriver, own: viewDriver === currentDriver, shifts, trips, last_updated: data.last_updated || null };
};
// Hämtar förarens data om den inte redan finns (t.ex. när boten frågas från hemskärmen)
window.taxiEnsureData = async function () {
  if (COMPANY) return;
  if (!data || !data.shifts) await loadData();
};

// ---- Åkeridata: siffror per period från servern (dataplan steg 1, t393u) ----
// I stället för att ladda ner hela årets resor för alla förare hämtas bara den period som visas,
// färdigräknad på servern (get_company_period). Samma regler som förut: ägaren ser namn, S admin ser
// åkeriet utan förar-id, övriga bara sin egen data. Arkivåren ingår redan på servern.
// Svarar inte servern (två försök) första gången används det gamla sättet (get_trip_data) som reserv.
const COMPANY_DETAIL_DAYS = 62;      // resorna följer med direkt för perioder upp till 62 dagar
const COMPANY_CHUNK_DAYS = 366;      // längre egna perioder hämtas i bitar om högst ett år
const COMPANY_CACHE_MS = 5 * 60 * 1000;
const companyApi = { cache: new Map(), pending: {}, failed: {}, trips: {}, tripsPending: {}, tripsFailed: {},
                     forar: {}, legacy: false, ok: false };
function companyUseApi() { return COMPANY && !companyApi.legacy; }
function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
async function companyRpc(name, args) {
  try { return await tripRpc(name, args, 20000); }
  catch (e1) { await new Promise(r => setTimeout(r, 1500)); return await tripRpc(name, args, 20000); }
}
function companyShift(s) {
  if (s.id != null) companyApi.forar[s.id] = s.forar;
  return { passnr: s.passnr, forar: s.forar, start: s.start, slut: s.slut, taxi: s.taxi,
           _id: s.id, _inkort: Number(s.inkort) || 0,
           _trips: Array.isArray(s.trips) ? s.trips.map(t => Object.assign({ forar: s.forar }, t)) : null };
}
async function companyFetch(key, from, to) {
  const days = daysBetween(from, to);
  const parts = [];
  for (let a = startOfDay(from); a <= to; ) {
    const b = new Date(a); b.setDate(b.getDate() + COMPANY_CHUNK_DAYS - 1);
    parts.push([new Date(a), b < to ? b : startOfDay(to)]);
    a = new Date(b); a.setDate(a.getDate() + 1);
  }
  const sc = akScopeNow();
  const one = ([a, b]) => {
    const base = { p_from: isoDay(a), p_to: isoDay(b), p_detail: days <= COMPANY_DETAIL_DAYS };
    if (companyApi.noScoped) return companyRpc('get_company_period', base);
    return companyRpc('get_company_period_scoped', Object.assign(base, { p_scope: sc.scope, p_id: sc.id }));
  };
  let rs;
  try { rs = await Promise.all(parts.map(one)); }
  catch (e) {
    // Servern saknar den nya funktionen (äldre databas): visa hela åkeriet som förut, utan väljare.
    if (!companyApi.noScoped && sc.scope === 'akeri' && /HTTP 404/.test(e.message)) {
      companyApi.noScoped = true; akSetupPicker();
      rs = await Promise.all(parts.map(one));
    } else if (sc.scope !== 'akeri' && /HTTP 4/.test(e.message)) {
      // Bilen/föraren går inte att visa (t.ex. ingen behörighet): tillbaka till hela åkeriet.
      akSetScope('akeri', null);
      throw e;
    } else throw e;
  }
  const totals = {};
  rs.forEach(r => Object.keys(r.totals || {}).forEach(k => { totals[k] = (totals[k] || 0) + Number(r.totals[k] || 0); }));
  const res = { totals, shifts: [].concat(...rs.map(r => (r.shifts || []).map(companyShift))),
                loose: [].concat(...rs.map(r => r.loose || [])), last_updated: rs[rs.length - 1].last_updated,
                fresh: rs[rs.length - 1].fresh, at: Date.now(),
                scope: sc.scope, id: sc.id, view: rs[0].view,
                breakdown: akMergeBreakdown(rs), idle: akMergeIdle(rs) };
  if (rs[rs.length - 1].choices) { companyApi.choices = rs[rs.length - 1].choices; akSetupPicker(); }
  companyApi.cache.set(key, res);
  if (companyApi.cache.size > 40) companyApi.cache.delete(companyApi.cache.keys().next().value);
  companyApi.ok = true;
  if (res.last_updated) data.last_updated = res.last_updated;
  return res;
}
// Ger { res } när perioden finns, annars { html } (fel) eller {} (hämtas, visa förra bilden nedtonad).
function companyPeriod(from, to) {
  const sc = akScopeNow();
  const key = sc.scope + '|' + (sc.id || '') + '|' + isoDay(from) + '|' + isoDay(to);
  const hit = companyApi.cache.get(key);
  const fresh = hit && Date.now() - hit.at < COMPANY_CACHE_MS;
  if (!fresh && !companyApi.pending[key] && !companyApi.failed[key]) {
    companyApi.pending[key] = true;
    companyFetch(key, from, to).then(() => { delete companyApi.pending[key]; render(); }, () => {
      delete companyApi.pending[key];
      if (key !== companyPeriodKeyNow(from, to)) { render(); return; }   // väljaren återställdes: hämta åkeriet
      if (!companyApi.ok) {
        // Första hämtningen gick inte: använd det gamla sättet (hela året) så att sidan ändå fungerar.
        companyApi.legacy = true;
        loadData().then(render);
        return;
      }
      const old = companyApi.cache.get(key);
      if (old) old.at = Date.now();   // visa det vi har, försök igen om en stund
      else companyApi.failed[key] = true;
      render();
    });
  }
  if (hit) return { res: hit };
  if (companyApi.failed[key]) return { html:
    '<div class="section load-error" role="alert" style="text-align:center;padding:24px 16px;">' +
    '<div style="font-weight:600;margin-bottom:6px;">Kunde inte hämta data – försök igen</div>' +
    '<div style="opacity:.75;font-size:.9em;margin-bottom:14px;">Servern svarade inte. Inga körningar har försvunnit.</div>' +
    '<button type="button" class="retry-btn" onclick="companyRetry(this)" style="padding:10px 22px;border-radius:999px;border:2px solid var(--primary);background:var(--primary);color:var(--on-primary,#fff);font-weight:600;font-size:1em;">Försök igen</button>' +
    '</div>' };
  const dash = document.getElementById('dashboard');
  if (dash && dash.querySelector('.stat-row') && !dash.querySelector('.load-error') && !dash.querySelector('.company-loading')) return {};
  return { html: '<div class="section arkiv-panel company-loading"><div class="arkiv-loading" role="status" aria-live="polite"><span class="arkiv-spin" aria-hidden="true"></span>Hämtar siffror…</div></div>' };
}
function companyPeriodKeyNow(from, to) {
  const sc = akScopeNow();
  return sc.scope + '|' + (sc.id || '') + '|' + isoDay(from) + '|' + isoDay(to);
}

// ---- Åkeridata: väljare Åkeri / Bil / Chaufför (uppe till höger) ----
// Siffrorna, målen och passlistan visas för hela åkeriet, en bil eller en förare. Valet sparas i telefonen.
// Servern (get_company_period_scoped) kontrollerar behörigheten: ägaren ser allt med namn, S admin ser
// bilar utan förarnas namn och bara sig själv som förare.
const AK_SCOPE_KEY = 'taxi_akeri_scope';
let akScope = (function () {
  try {
    const v = JSON.parse(localStorage.getItem(AK_SCOPE_KEY) || 'null');
    if (v && (v.scope === 'bil' || v.scope === 'forare') && v.id) return { scope: v.scope, id: String(v.id) };
  } catch (e) {}
  return { scope: 'akeri', id: null };
})();
function akScopeNow() { return companyApi.noScoped ? { scope: 'akeri', id: null } : akScope; }
function akSetScope(scope, id) {
  akScope = (scope === 'bil' || scope === 'forare') && id ? { scope, id: String(id) } : { scope: 'akeri', id: null };
  try { localStorage.setItem(AK_SCOPE_KEY, JSON.stringify(akScope)); } catch (e) {}
  akSetupPicker();
}
function akCarLabel(c) { return c.taxi + (c.in_register ? '' : ' (ej i bilregistret)'); }
function shortLabel(n) { return window.shortName ? shortName(n) : (n || ''); }   // kort namn, se namn.js
function akDriverLabel(d) {
  if (d.id === currentDriver && !d.name) return 'Jag (' + d.id + ')';
  return d.name ? shortLabel(d.name) + ' (' + d.id + ')' : d.id;
}
function akOptions(scope) {
  const ch = companyApi.choices || {};
  const cur = akScope.scope === scope ? akScope.id : null;
  const opt = (v, t) => `<option value="${escHtml(v)}"${v === cur ? ' selected' : ''}>${escHtml(t)}</option>`;
  const grp = (label, items) => items.length ? `<optgroup label="${escHtml(label)}">${items.join('')}</optgroup>` : '';
  let html = '', ids = [];
  if (scope === 'bil') {
    const cars = ch.cars || [];
    ids = cars.map(c => c.taxi);
    html = grp('I bilregistret', cars.filter(c => c.in_register).map(c => opt(c.taxi, akCarLabel(c))))
         + grp('Ej i bilregistret', cars.filter(c => !c.in_register).map(c => opt(c.taxi, akCarLabel(c))));
  } else {
    const drv = (ch.drivers || []).slice().sort((a, b) => akDriverLabel(a).localeCompare(akDriverLabel(b), 'sv'));
    ids = drv.map(d => d.id);
    html = grp('Aktiva förare', drv.filter(d => d.active).map(d => opt(d.id, akDriverLabel(d))))
         + grp('Har kört i perioden', drv.filter(d => !d.active).map(d => opt(d.id, akDriverLabel(d))));
  }
  if (cur && !ids.includes(cur)) html = opt(cur, cur) + html;
  return { html, first: ids[0] || null };
}
function akSetupPicker() {
  const label = document.getElementById('driver-label');
  const row = document.getElementById('ak-pick-row');
  if (!COMPANY || !label) return;
  if (companyApi.noScoped || companyApi.legacy) { label.innerHTML = ''; if (row) row.classList.add('hidden'); return; }
  let sel = document.getElementById('ak-scope');
  if (!sel) {
    label.innerHTML = '<select id="ak-scope" aria-label="Visa statistik för">' +
      '<option value="akeri">Åkeri</option><option value="bil">Bil</option><option value="forare">Chaufför</option></select>';
    sel = document.getElementById('ak-scope');
    sel.onchange = e => {
      const scope = e.target.value;
      if (scope === 'akeri') akSetScope('akeri', null);
      else {
        const o = akOptions(scope);
        if (!o.first) { e.target.value = akScope.scope; return; }
        akSetScope(scope, o.first);
      }
      render();
    };
  }
  sel.value = akScope.scope;
  if (!row) return;
  if (akScope.scope === 'akeri') { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  document.getElementById('ak-pick-label').textContent = akScope.scope === 'bil' ? 'Bil' : 'Chaufför';
  const pick = document.getElementById('ak-pick');
  pick.setAttribute('aria-label', akScope.scope === 'bil' ? 'Välj bil' : 'Välj chaufför');
  pick.innerHTML = akOptions(akScope.scope).html;
  pick.value = akScope.id;
  pick.onchange = e => { akSetScope(akScope.scope, e.target.value); render(); };
}
// Långa egna perioder hämtas i bitar: lägg ihop uppdelningen per förare/bil.
function akMergeBreakdown(rs) {
  const out = new Map();
  let anonSplit = false;
  rs.forEach(r => (r.breakdown || []).forEach(b => {
    const k = b.taxi != null ? 't' + b.taxi : b.forar != null ? 'f' + b.forar : 'a' + b.anon_nr;
    if (b.anon_nr != null && rs.length > 1) anonSplit = true;
    const o = out.get(k);
    if (!o) { out.set(k, Object.assign({}, b)); return; }
    ['shifts', 'minutes', 'km', 'antal', 'inkort'].forEach(f => { o[f] = (Number(o[f]) || 0) + (Number(b[f]) || 0); });
  }));
  const list = Array.from(out.values()).sort((a, b) => (Number(b.inkort) || 0) - (Number(a.inkort) || 0));
  return anonSplit ? null : list;   // "Förare N" kan inte läggas ihop mellan år
}
function akMergeIdle(rs) {
  const xs = rs.map(r => r.idle).filter(Boolean);
  if (!xs.length) return null;
  return { days: xs.reduce((a, x) => a + (Number(x.days) || 0), 0), active: xs.reduce((a, x) => a + (Number(x.active) || 0), 0),
           idle: xs.reduce((a, x) => a + (Number(x.idle) || 0), 0), first_day: xs[0].first_day,
           from: xs[0].from, to: xs[xs.length - 1].to };
}
function akShortDay(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '-' + m[1].slice(2) : ''; }
function akBreakdownHtml(P) {
  if (!P || P.scope === 'akeri') return '';
  const bil = P.scope === 'bil';
  const title = bil ? 'Förare som kört bilen' : 'Bilar föraren kört';
  if (P.breakdown === null) return `<div class="section"><div class="stat-row ak-bd-title"><span class="toggle"></span><span class="label">${title}</span><span class="value"></span></div>
    <div class="sub visible"><span>Visas för perioder upp till ett år</span><span></span></div></div>`;
  const rows = (P.breakdown || []).map(b => {
    const name = bil ? (b.name ? shortLabel(b.name) + ' (' + b.forar + ')' : b.forar != null ? (b.forar === currentDriver ? 'Jag (' + b.forar + ')' : b.forar) : 'Förare ' + b.anon_nr)
                     : b.taxi + (b.in_register === false ? ' (ej i bilregistret)' : '');
    const key = 'bd:' + P.scope + ':' + (bil ? (b.forar || 'a' + b.anon_nr) : b.taxi);
    return `<div class="stat-row" data-key="${escHtml(key)}" onclick="toggle(this)"><span class="toggle">+</span><span class="label">${escHtml(name)}</span><span class="value">${formatSEK(Number(b.inkort) || 0)}</span></div>
      <div class="sub"><span>Timmar</span><span>${formatTime(Number(b.minutes) || 0)}</span></div>
      <div class="sub"><span>Antal skift</span><span>${Number(b.shifts) || 0} st</span></div>
      <div class="sub"><span>Antal körningar</span><span>${Number(b.antal) || 0} st</span></div>
      <div class="sub"><span>Körda km</span><span>${(Number(b.km) || 0).toFixed(1)} km</span></div>`;
  }).join('');
  let html = `<div class="section"><div class="stat-row ak-bd-title"><span class="toggle"></span><span class="label">${title}</span><span class="value">${(P.breakdown || []).length} st</span></div>
    ${rows || '<div class="sub visible"><span>Inga körningar i perioden</span><span></span></div>'}</div>`;
  const I = P.idle;
  if (bil && I && I.days > 0) html += `<div class="section">
    <div class="stat-row" data-key="ak-idle" onclick="toggle(this)"><span class="toggle">+</span><span class="label">Dagar utan körning</span><span class="value">${I.idle} av ${I.days}</span></div>
    <div class="sub"><span>Dagar med körning</span><span>${I.active} st</span></div>
    <div class="sub"><span>Räknat</span><span>${escHtml(akShortDay(I.from) + ' – ' + akShortDay(I.to))}</span></div></div>`;
  return html;
}

function companyRetry(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Hämtar...'; }
  companyApi.failed = {};
  render();
}
function companyTripsPlaceholder(id) {
  return companyApi.tripsFailed[id]
    ? '<div class="company-trips-msg" style="padding:8px 12px;opacity:.75;">Kunde inte hämta resorna. Fäll ihop och öppna igen för att försöka på nytt.</div>'
    : '<div class="company-trips-msg" style="padding:8px 12px;opacity:.75;">Hämtar resor…</div>';
}
// Resor för pass i långa perioder (År, långa egna perioder) hämtas först när passet fälls ut.
function companyLoadTrips(ids) {
  ids = ids.map(Number).filter(id => !isNaN(id) && !companyApi.trips[id] && !companyApi.tripsPending[id]);
  if (!ids.length) return;
  ids.forEach(id => { companyApi.tripsPending[id] = true; delete companyApi.tripsFailed[id]; });
  for (let i = 0; i < ids.length; i += 300) {
    const part = ids.slice(i, i + 300);
    companyRpc('get_company_shift_trips', { p_ids: part }).then(r => {
      part.forEach(id => {
        const f = companyApi.forar[id];
        companyApi.trips[id] = ((r && r[id]) || []).map(t => Object.assign({ forar: f }, t));
      });
    }, () => { part.forEach(id => { companyApi.tripsFailed[id] = true; }); })
      .finally(() => { part.forEach(id => { delete companyApi.tripsPending[id]; }); render(); });
  }
}

// ---- Arkiv: äldre år hämtas automatiskt när man bläddrar dit (t381u) ----
// Äldre år (före 1 januari i år) ligger i ett separat arkiv på servern. Inget hämtas när appen startar
// eller när man tittar på i år. Först när den valda perioden (Dag/Vecka/Månad/År/egen period) går in i ett
// äldre år hämtas just den biten: hela året för en förare (bara egna resor, litet), en månad i taget för
// ägaren och Åkeridata (alla förare). Det som hämtats ligger kvar i minnet under sessionen (inte i telefonen).
const ARKIV_MONTH_NAMES = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const ARKIV_PARALLEL = 3;
const archive = { chunks: {}, pending: {}, failed: {}, queue: [], running: 0, refreshPicker: false };
function archiveMonthly() { return COMPANY || myRole === 'agare' || myRole === 'superadmin'; }
// Bitar (nycklar '2025' eller '2025-12') som behövs för perioden. Tom lista när perioden ligger i år.
function archiveKeysFor(start, end) {
  const cy = new Date().getFullYear();
  if (!start || !end || start.getFullYear() >= cy || start.getFullYear() < 2000) return [];
  const last = end.getFullYear() < cy ? end : new Date(cy - 1, 11, 31);
  const keys = [];
  if (archiveMonthly()) {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1))
      keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  } else {
    for (let y = start.getFullYear(); y <= last.getFullYear(); y++) keys.push(String(y));
  }
  return keys;
}
function archiveKeyLabel(k) {
  const [y, m] = k.split('-');
  return m ? ARKIV_MONTH_NAMES[+m - 1] + ' ' + y : y;
}
function archiveMergeInto(d) {
  Object.keys(archive.chunks).forEach(k => {
    const a = archive.chunks[k];
    d.trips = (d.trips || []).concat(a.trips);
    d.shifts = (d.shifts || []).concat(a.shifts);
  });
}
function dedupData(d) {
  const seenShifts = new Set();
  d.shifts = (d.shifts || []).filter(s => {
    const key = (s.passnr || '') + '|' + (s.forar || defForar()) + '|' + String(s.start || '').replace(/\D/g, '').slice(0, 8); // passnr återanvänds
    if (seenShifts.has(key)) return false;
    seenShifts.add(key);
    return true;
  });
  const seenTrips = new Set();
  d.trips = (d.trips || []).filter(t => {
    const key = (t.kvittonr || '') + '|' + (t.forar || defForar()) + '|' + (t.startdatum || '');
    if (seenTrips.has(key)) return false;
    seenTrips.add(key);
    return true;
  });
}
function archiveEnsure(keys) {
  keys.forEach(k => {
    if (archive.chunks[k] || archive.pending[k] || archive.failed[k]) return;
    archive.pending[k] = true;
    archive.queue.push(k);
  });
  archivePump();
}
function archivePump() {
  while (archive.running < ARKIV_PARALLEL && archive.queue.length) {
    const k = archive.queue.shift();
    archive.running++;
    archiveFetch(k).finally(() => {
      archive.running--;
      delete archive.pending[k];
      archivePump();
      if (!archive.running) archiveDone();
      else render();
    });
  }
}
async function archiveFetch(k) {
  const [y, m] = k.split('-');
  const args = { p_year: +y };
  if (m) args.p_month = +m;
  try {
    let r;
    try { r = await tripRpc('get_trip_archive', args, 30000); }
    catch (e1) { await new Promise(res => setTimeout(res, 1200)); r = await tripRpc('get_trip_archive', args, 30000); }
    const mark = x => Object.assign({}, x, { _arkiv: k });
    const a = { trips: ((r && r.trips) || []).map(mark), shifts: ((r && r.shifts) || []).map(mark) };
    archive.chunks[k] = a;
    if (data && !loadFailed) {
      data.trips = (data.trips || []).concat(a.trips);
      data.shifts = (data.shifts || []).concat(a.shifts);
      dedupData(data);
      tripsByDriver = null; orphanTrips = null;
      if (a.trips.length || a.shifts.length) archive.refreshPicker = true;
    }
  } catch (e) {
    archive.failed[k] = true;
  }
}
async function archiveDone() {
  if (archive.refreshPicker && !COMPANY && DRIVER_PICKER_ROLES.includes(myRole)) {
    archive.refreshPicker = false;
    try { await setupDriverPicker(); } catch (e) {}
  }
  render();
}
function archiveRetry() {
  Object.keys(archive.failed).forEach(k => delete archive.failed[k]);
  render();
}
// Körs i render(): startar hämtning vid behov och ger en liten statusrad.
// hide = true medan perioden inte är färdighämtad, så att inga felaktiga nollor visas.
function archiveStatus(rangeStart, rangeEnd) {
  if (!data || loadFailed) return { html: '', hide: false };
  const keys = archiveKeysFor(rangeStart, rangeEnd);
  if (!keys.length) return { html: '', hide: false };
  archiveEnsure(keys);
  const missing = keys.filter(k => !archive.chunks[k]);
  const failed = missing.filter(k => archive.failed[k]);
  if (failed.length) {
    return { hide: true, html: `<div class="section arkiv-panel"><div class="arkiv-error" role="alert">Kunde inte hämta ${escHtml(archiveKeyLabel(failed[0]))} från arkivet.</div>
      <button type="button" class="arkiv-btn" onclick="archiveRetry()">Försök igen</button></div>` };
  }
  if (missing.length) {
    const done = keys.length - missing.length;
    const what = keys.length > 1 && archiveMonthly() ? rangeStart.getFullYear() + (rangeEnd.getFullYear() !== rangeStart.getFullYear() && rangeEnd.getFullYear() < new Date().getFullYear() ? '–' + rangeEnd.getFullYear() : '') : archiveKeyLabel(missing[0]);
    return { hide: true, html: `<div class="section arkiv-panel"><div class="arkiv-loading" role="status" aria-live="polite"><span class="arkiv-spin" aria-hidden="true"></span>Hämtar ${escHtml(what)} från arkivet…</div>
      <div class="arkiv-note">${keys.length > 1 && archiveMonthly() ? done + ' av ' + keys.length + ' månader klara' : 'Det tar bara en kort stund.'}</div></div>` };
  }
  return { hide: false, html: `<div class="arkiv-tag">📦 Äldre data från arkivet</div>` };
}

// Vilka rader som är utfällda sparas så att de förblir utfällda när man byter
// datum, flik, egen period eller förare. Bara »-knappen (idag) fäller ihop allt.
const openKeys = new Set();
function rememberOpen(el, isOpen) {
  const k = el.dataset && el.dataset.key;
  if (!k) return;
  if (isOpen) openKeys.add(k); else openKeys.delete(k);
}
function restoreOpen(root) {
  root.querySelectorAll('[data-key]').forEach(el => {
    if (!openKeys.has(el.dataset.key)) return;
    if (el.classList.contains('shift-trip')) setTripOpen(el, true);
    else if (el.getAttribute('onclick') === 'toggleShift(this)') setShiftOpen(el, true);
    else setOpen(el, true);
  });
}
function setOpen(el, isOpen) {
  el.classList.toggle('open', isOpen);
  const icon = el.querySelector('.toggle');
  if (icon && icon.textContent) icon.textContent = isOpen ? '−' : '+';
  let next = el.nextElementSibling;
  while (next && next.classList.contains('sub')) {
    next.classList.toggle('visible', isOpen);
    next = next.nextElementSibling;
  }
}
function setShiftOpen(el, isOpen) {
  el.classList.toggle('open', isOpen);
  const icon = el.querySelector('.toggle');
  if (icon) icon.textContent = isOpen ? '−' : '+';
  const content = el.nextElementSibling;
  if (content && content.classList.contains('shift-content')) content.style.display = isOpen ? 'block' : 'none';
}
function setTripOpen(el, isOpen) {
  el.classList.toggle('open', isOpen);
  const icon = el.querySelector('.toggle');
  if (icon) icon.textContent = isOpen ? '−' : '+';
  let next = el.nextElementSibling;
  while (next && next.classList.contains('trip-detail')) {
    next.classList.toggle('visible', isOpen);
    next = next.nextElementSibling;
  }
}

function toggle(el) {
  const isOpen = !el.classList.contains('open');
  setOpen(el, isOpen);
  rememberOpen(el, isOpen);
}

function toggleShift(el) {
  const isOpen = !el.classList.contains('open');
  setShiftOpen(el, isOpen);
  rememberOpen(el, isOpen);
  if (isOpen && el.dataset.lazy) companyLoadTrips([el.dataset.lazy]);   // Åkeridata: hämta passets resor
}

function toggleTrip(el, ev) {
  const e = ev || window.event;
  if (e) e.stopPropagation();
  const isOpen = !el.classList.contains('open');
  setTripOpen(el, isOpen);
  rememberOpen(el, isOpen);
}

function editGoal() {
  const val = prompt('Nytt mål (kr):', goals[currentTab]);
  if (val && !isNaN(val)) {
    goals[currentTab] = parseInt(val);
    render();
  }
}

function syncTabs() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    lastTab = currentTab;
    customRange = null;
    localStorage.setItem(TAB_KEY, currentTab);
    syncTabs();
    render();
  });
});

function shiftPeriod(dir) {
  // Flyttar den egna perioden lika många dagar som den är lång
  const len = daysBetween(customRange.from, customRange.to);
  const f = new Date(customRange.from); f.setDate(f.getDate() + dir * len);
  const t = new Date(customRange.to); t.setDate(t.getDate() + dir * len);
  customRange = { from: f, to: t };
  currentDate = new Date(t);
}

document.getElementById('prev').onclick = () => {
  if (currentTab === 'period' && customRange) shiftPeriod(-1);
  else if (currentTab === 'vecka') currentDate.setDate(currentDate.getDate() - 7);
  else if (currentTab === 'manad') currentDate.setMonth(currentDate.getMonth() - 1);
  else if (currentTab === 'ar') currentDate = new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1);
  else currentDate.setDate(currentDate.getDate() - 1);
  render();
};
document.getElementById('next').onclick = () => {
  if (isCurrentPeriod()) return;
  if (currentTab === 'period' && customRange) shiftPeriod(1);
  else if (currentTab === 'vecka') currentDate.setDate(currentDate.getDate() + 7);
  else if (currentTab === 'manad') currentDate.setMonth(currentDate.getMonth() + 1);
  else if (currentTab === 'ar') currentDate = new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1);
  else currentDate.setDate(currentDate.getDate() + 1);
  render();
};
document.getElementById('today').onclick = () => {
  currentDate = new Date();
  if (currentTab === 'period') { currentTab = lastTab; customRange = null; }
  openKeys.clear();   // »: hoppa till idag och fäll ihop allt
  render();
};

// ---- Egen period: kalender där man trycker på första och sista dagen ----
let calMonth = new Date();
let calFrom = null;
let calTo = null;

function ensurePeriodModal() {
  if (document.getElementById('period-modal')) return;
  const m = document.createElement('div');
  m.id = 'period-modal';
  m.className = 'pm-overlay';
  m.innerHTML = `<div class="pm-box" role="dialog" aria-label="Välj period">
      <div class="pm-head"><button type="button" id="pm-prev" aria-label="Föregående månad">‹</button><span id="pm-title"></span><button type="button" id="pm-next" aria-label="Nästa månad">›</button></div>
      <div class="pm-hint">Tryck på första och sista dagen</div>
      <div class="pm-cal" id="pm-cal"></div>
      <div class="pm-sel" id="pm-sel"></div>
      <div class="pm-btns"><button type="button" id="pm-cancel">Avbryt</button><button type="button" id="pm-ok" class="primary">Visa</button></div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) closePeriodModal(); });
  document.getElementById('pm-prev').onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); renderPeriodCal(); };
  document.getElementById('pm-next').onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); renderPeriodCal(); };
  document.getElementById('pm-cancel').onclick = closePeriodModal;
  document.getElementById('pm-ok').onclick = confirmPeriod;
}

function openPeriodModal() {
  ensurePeriodModal();
  const [s, e] = getRange();
  calFrom = startOfDay(s);
  calTo = startOfDay(e);
  calMonth = new Date(calTo.getFullYear(), calTo.getMonth(), 1);
  renderPeriodCal();
  document.getElementById('period-modal').classList.add('open');
}

function closePeriodModal() {
  const m = document.getElementById('period-modal');
  if (m) m.classList.remove('open');
}

function renderPeriodCal() {
  document.getElementById('pm-title').textContent = months[calMonth.getMonth()] + ' ' + calMonth.getFullYear();
  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const last = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
  const today = startOfDay(new Date());
  let html = ['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'].map(d => `<div class="pm-wd">${d}</div>`).join('');
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) html += '<div></div>';
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
    const t = date.getTime();
    let cls = 'pm-day';
    if (calFrom && t === calFrom.getTime()) cls += ' sel';
    if (calTo && t === calTo.getTime()) cls += ' sel';
    if (calFrom && calTo && t > calFrom.getTime() && t < calTo.getTime()) cls += ' in';
    if (t === today.getTime()) cls += ' today';
    if (date > today) cls += ' future';
    html += `<button type="button" class="${cls}" data-d="${d}">${d}</button>`;
  }
  const cal = document.getElementById('pm-cal');
  cal.innerHTML = html;
  cal.querySelectorAll('.pm-day').forEach(b => b.onclick = () => pickDay(+b.dataset.d));
  const sel = document.getElementById('pm-sel');
  sel.textContent = calFrom ? (ddmm(calFrom) + '-' + String(calFrom.getFullYear()).slice(-2) + ' – ' +
    (calTo ? ddmm(calTo) + '-' + String(calTo.getFullYear()).slice(-2) : 'välj sista dagen')) : '';
  document.getElementById('pm-ok').disabled = !calFrom;
}

function pickDay(d) {
  const date = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
  if (!calFrom || calTo) { calFrom = date; calTo = null; }
  else if (date < calFrom) { calTo = calFrom; calFrom = date; }
  else calTo = date;
  renderPeriodCal();
}

function confirmPeriod() {
  if (!calFrom) return;
  if (currentTab !== 'period') lastTab = currentTab;
  customRange = { from: new Date(calFrom), to: new Date(calTo || calFrom) };
  currentTab = 'period';
  currentDate = new Date(customRange.to);
  closePeriodModal();
  render();
}

const periodBtnEl = document.getElementById('period-btn');
if (periodBtnEl) periodBtnEl.onclick = openPeriodModal;


// ---- Åkeriets mål (bara ägaren kan ändra; servern kontrollerar behörigheten) ----
function openGoalModal() {
  if (!companyGoals || !isOwnerRole()) return;
  let m = document.getElementById('goal-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'goal-modal';
    m.className = 'pm-overlay';
    m.innerHTML = `<div class="pm-box" role="dialog" aria-label="Åkeriets mål">
      <div class="pm-title" style="text-align:center;font-weight:700;margin-bottom:0.6rem;">Åkeriets mål</div>
      <div class="pm-hint">Mål per bil. Totalen blir målet × antal bilar under Bilar.</div>
      <label class="gm-row"><span>Per bil / dag</span><input id="gm-day" type="number" inputmode="numeric" min="0" step="100"></label>
      <label class="gm-row"><span>Per bil / vecka</span><input id="gm-week" type="number" inputmode="numeric" min="0" step="500"></label>
      <label class="gm-row"><span>Per bil / månad</span><input id="gm-month" type="number" inputmode="numeric" min="0" step="1000"></label>
      <div id="gm-err" class="gm-err"></div>
      <div class="pm-btns"><button type="button" id="gm-cancel">Avbryt</button><button type="button" id="gm-save" class="primary">Spara</button></div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
    document.getElementById('gm-cancel').onclick = () => { m.style.display = 'none'; };
    document.getElementById('gm-save').onclick = saveGoals;
  }
  document.getElementById('gm-day').value = companyGoals.per_car_day;
  document.getElementById('gm-week').value = companyGoals.per_car_week;
  document.getElementById('gm-month').value = companyGoals.per_car_month;
  document.getElementById('gm-err').textContent = '';
  m.style.display = 'flex';
}

async function saveGoals() {
  const v = id => Number(document.getElementById(id).value);
  const day = v('gm-day'), week = v('gm-week'), month = v('gm-month');
  const err = document.getElementById('gm-err');
  if (![day, week, month].every(x => Number.isFinite(x) && x >= 0 && x <= 10000000)) {
    err.textContent = 'Kontrollera värdena.';
    return;
  }
  const btn = document.getElementById('gm-save');
  btn.disabled = true;
  try {
    companyGoals = await tripRpc('set_company_goals', { p_month: month, p_week: week, p_day: day });
    document.getElementById('goal-modal').style.display = 'none';
    render();
  } catch (e) {
    err.textContent = 'Kunde inte spara målen.';
  } finally {
    btn.disabled = false;
  }
}
