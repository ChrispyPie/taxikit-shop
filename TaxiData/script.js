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
if (!['dag', 'vecka', 'manad'].includes(currentTab)) currentTab = 'dag';
let lastTab = currentTab;          // fliken att gå tillbaka till efter egen period
let customRange = null;            // { from: Date, to: Date } när egen period är vald
let currentDriver = localStorage.getItem('taxi_driver') || '';
let viewDriver = currentDriver;    // föraren som visas (kan väljas av ägaren)
let driverNames = {};              // id -> namn (om servern ger namn)
let tripsByDriver = null;

const goals = { dag: 4000, vecka: 25000, manad: 100000 };
const typeMap = { '160': 'Kort', '283': 'Kredit', '163': 'Swish', '1': 'Kontant', '164': 'Uber', '161': 'Faktura', '185': 'Övrigt', '999': 'BOM' };
const weekdays = ['Sö', 'Må', 'Ti', 'On', 'To', 'Fr', 'Lö'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const UBER_FEE = 0.26;

async function tripRpc(name, args) {
  const res = await fetch(TRIP_API_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { 'apikey': TRIP_API_KEY, 'Authorization': 'Bearer ' + TRIP_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ p_token: localStorage.getItem('taxi_session') || '' }, args || {}))
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadData() {
  currentDriver = localStorage.getItem('taxi_driver') || '';
  viewDriver = currentDriver;
  try {
    // Resedata hämtas från servern (Supabase) och kräver inloggning.
    // Förare får bara sina egna resor; inga publika datafiler används.
    data = (await tripRpc('get_trip_data', { p_dataset: 'current' })) || {};

    const seenShifts = new Set();
    data.shifts = (data.shifts || []).filter(s => {
      const key = (s.passnr || '') + '|' + (s.forar || '710022');
      if (seenShifts.has(key)) return false;
      seenShifts.add(key);
      return true;
    });
    const seenTrips = new Set();
    data.trips = (data.trips || []).filter(t => {
      const key = (t.kvittonr || '') + '|' + (t.forar || '710022');
      if (seenTrips.has(key)) return false;
      seenTrips.add(key);
      return true;
    });
  } catch (e) {
    data = {};
  }
  tripsByDriver = null;
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
      driverNames[r.id] = n;
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
  (data.shifts || []).forEach(s => ids.add(s.forar || '710022'));
  (data.trips || []).forEach(t => ids.add(t.forar || '710022'));
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
  return COMPANY || (rec.forar || '710022') === viewDriver;
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
  const shiftDriver = shift.forar || '710022';
  if (!tripsByDriver) {
    tripsByDriver = {};
    (data.trips || []).forEach(t => { const f = t.forar || '710022'; (tripsByDriver[f] = tripsByDriver[f] || []).push(t); });
  }
  return (tripsByDriver[shiftDriver] || []).filter(t => {
    const tripDate = t.startdatum;
    const tripTime = t.starttid;
    if (!tripDate || !tripTime) return false;
    const tripDt = new Date(tripDate + 'T' + tripTime);
    return tripDt >= shiftStart && tripDt <= shiftEnd;
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

  const [rangeStart, rangeEnd] = getRange();
  let shifts = getShiftsInRange(rangeStart, rangeEnd);
  shifts.sort((a, b) => (b.start || '').localeCompare(a.start || ''));

  let allTrips = [];
  let totalMinutes = 0;
  shifts.forEach(s => {
    allTrips = allTrips.concat(getTripsForShift(s));
    totalMinutes += parseTime(s.tid);
  });
  if (currentTab === 'dag' && !COMPANY) allTrips.sort((a, b) => ((a.startdatum || '') + (a.starttid || '')).localeCompare((b.startdatum || '') + (b.starttid || '')));

  const trips = allTrips.filter(t => t.kredittyp !== '999');
  const antal = trips.length;
  const totalKm = shifts.reduce((s, sh) => s + parseFloat((sh.km || '0').replace(',', '.')), 0);
  const arbetad = formatTime(totalMinutes);
  const antalSkift = shifts.length;
  const antalForare = new Set(shifts.map(s => s.forar || '710022')).size;
  const antalBilar = new Set(shifts.map(s => s.taxi).filter(Boolean)).size;

  const kort = sumByType(trips, '160');
  const kredit = sumByType(trips, '283');
  const swish = sumByType(trips, '163');
  const kontant = sumByType(trips, '1');
  const uberGross = sumByType(trips, '164');
  const uberNetto = uberGross * (1 - UBER_FEE);
  const faktura = sumByType(trips, '161');
  const ovrigt = sumByType(trips, '185');
  const bom = sumByType(allTrips, '999');
  const dricks = trips.reduce((s, t) => s + parseAmount(t.dricks), 0);

  const inkort = kort + kredit + swish + kontant + uberNetto + faktura + ovrigt;
  const krPerKorning = antal ? Math.round(inkort / antal) : 0;
  const krPerMil = totalKm ? Math.round(inkort / (totalKm / 10)) : 0;
  const krPerTimme = totalMinutes ? Math.round(inkort / (totalMinutes / 60)) : 0;
  const goalTab = isPeriod ? 'dag' : currentTab;
  // Åkeriet: mål per bil × antal bilar. Egen period: dagsmålet × antal dagar.
  const periodDays = isPeriod ? daysBetween(customRange.from, customRange.to) : 1;
  const perCar = companyGoals ? (goalTab === 'manad' ? companyGoals.per_car_month : goalTab === 'vecka' ? companyGoals.per_car_week : companyGoals.per_car_day) : 0;
  const goal = COMPANY ? perCar * (companyGoals ? companyGoals.cars : 0) * periodDays : (goals[goalTab] || 4000);
  const diff = inkort - goal;
  const inkortPerSkift = antalSkift ? Math.round(inkort / antalSkift) : 0;
  const remaining = Math.max(0, goal - inkort);
  const remainingShifts = getRemainingShifts(currentDate, currentTab);
  const behovPerSkift = remainingShifts > 0 ? Math.round(remaining / remainingShifts) : 0;
  const diffColor = diff >= 0 ? '#38a169' : '#e53e3e';
  // Förare: Mål/Diff per dag/vecka/månad (inte för egen period).
  // Åkeriet: Mål/Diff alltid när målen kunde hämtas (egen period = dagsmål × dagar).
  // Antal bilar = bilar registrerade under Bilar (admin). 0 bilar => tips i stället för mål 0.
  const noCars = COMPANY && !!companyGoals && !(companyGoals.cars > 0);
  const showGoal = COMPANY ? !!companyGoals && !noCars : !isPeriod;
  const remainingDays = COMPANY && !isPeriod && currentTab !== 'dag' && isCurrent ? getRemainingShifts(currentDate, currentTab) : 0;

  let timmarSubs = '';
  if (COMPANY || isPeriod || currentTab !== 'dag' || shifts.length > 1) {
    timmarSubs = `
      <div class="sub"><span>Antal skift</span><span>${antalSkift} st</span></div>`;
    if (COMPANY && isOwnerRole()) timmarSubs += `
      <div class="sub"><span>Antal förare</span><span>${antalForare} st</span></div>`;
    if (COMPANY) timmarSubs += `
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
    const how = isPeriod ? `${formatSEK(companyGoals.per_car_day)} × ${companyGoals.cars} bilar × ${periodDays} dagar` : `${formatSEK(perCar)} × ${companyGoals.cars} bilar`;
    html += canEdit
      ? `<div class="stat-row" id="goal-row" onclick="openGoalModal()"><span class="toggle">✎</span><span class="label">Mål</span><span class="value" style="border-bottom: 1px solid #cbd5e0; padding-bottom: 2px;">− ${formatSEK(goal)}</span></div>
    <div class="sub visible"><span>Per bil</span><span>${how}</span></div>`
      : `<div class="stat-row" id="goal-row" data-key="mal" onclick="toggle(this)"><span class="toggle">+</span><span class="label">Mål</span><span class="value" style="border-bottom: 1px solid #cbd5e0; padding-bottom: 2px;">− ${formatSEK(goal)}</span></div>
    <div class="sub"><span>Per bil</span><span>${how}</span></div>`;
  } else if (showGoal) html += `
    <div class="stat-row" onclick="editGoal()"><span class="toggle"></span><span class="label">Mål</span><span class="value" style="border-bottom: 1px solid #cbd5e0; padding-bottom: 2px;">− ${formatSEK(goal)}</span></div>`;
  if (showGoal) html += `
    <div class="stat-row" data-key="diff" onclick="toggle(this)"><span class="toggle">${diffSubs ? '+' : ''}</span><span class="label">Diff</span><span class="value" style="color:${diffColor}; font-weight:700;">${formatSEK(diff)}</span></div>
    ${diffSubs}`;
  html += `</div>`;

  if (currentTab === 'dag' && !COMPANY) {
    // En förares dag: lista med alla körningar
    if (allTrips.length) {
      html += `<div class="section">${allTrips.map(t => {
        const isBom = t.kredittyp === '999';
        return `<div class="stat-row" data-key="trip:${escHtml(t.kvittonr)}|${escHtml(t.forar || '710022')}" onclick="toggle(this)" style="${isBom ? 'opacity:0.6;' : ''}"><span class="toggle">+</span><span class="label">${escHtml(t.kvittonr)}${isBom ? ' (BOM)' : ''}</span><span class="value">${formatSEK(parseAmount(t.belopp))}</span></div>
        ${tripDetailRows(t, '')}`;
      }).join('')}</div>`;
    }
  } else if (shifts.length) {
    // Lista med skift (för hela åkeriet även på dagsfliken: ett skift per förare och bil)
    html += `<div class="section">${shifts.map(s => {
      const shiftTrips = getTripsForShift(s);
      const shiftUber = shiftTrips.filter(t => t.kredittyp === '164').reduce((sum, t) => sum + parseAmount(t.belopp), 0);
      const shiftOther = shiftTrips.filter(t => t.kredittyp !== '999' && t.kredittyp !== '164').reduce((sum, t) => sum + parseAmount(t.belopp), 0);
      const shiftInkort = shiftOther + shiftUber * (1 - UBER_FEE);
      const dateLabel = (COMPANY && currentTab === 'dag') ? '' : formatShiftDate(s.start) + ' ';
      // Förare visas bara för ägaren; övriga ser bara bilen
      const who = COMPANY ? `<span class="shift-who">${escHtml(s.taxi || '?')}${isOwnerRole() ? ' · ' + escHtml(driverLabel(s.forar || '710022')) : ''}</span>` : '';
      const tripsHtml = shiftTrips.map(t => {
        const isBom = t.kredittyp === '999';
        return `<div class="sub shift-trip" data-key="st:${escHtml(t.kvittonr)}|${escHtml(t.forar || '710022')}" onclick="toggleTrip(this, event)" style="${isBom ? 'opacity:0.6;' : ''}"><span class="toggle">+</span><span>${escHtml(t.kvittonr)}${isBom ? ' (BOM)' : ''}</span><span>${formatSEK(parseAmount(t.belopp))}</span></div>
          <div class="sub trip-detail"><span>Start</span><span>${t.starttid || '00:00'} – zon ${t.startzon || '?'}</span></div>
          <div class="sub trip-detail"><span>Slut</span><span>${t.sluttid || '00:00'} – zon ${t.slutzon || '?'}</span></div>
          <div class="sub trip-detail"><span>Typ</span><span>${typeMap[t.kredittyp] || t.kredittyp || '?'}</span></div>
          <div class="sub trip-detail"><span>Dricks</span><span>${formatSEK(parseAmount(t.dricks))}</span></div>`;
      }).join('');
      return `<div class="stat-row" data-key="shift:${escHtml(s.passnr)}|${escHtml(s.forar || '710022')}" onclick="toggleShift(this)"><span class="toggle">+</span><span class="label">${dateLabel}#${escHtml(s.passnr)}${who}</span><span class="value">${formatSEK(shiftInkort)}</span></div>
      <div class="shift-content">${tripsHtml}</div>`;
    }).join('')}</div>`;
  }

  const dash = document.getElementById('dashboard');
  dash.innerHTML = html;
  restoreOpen(dash);
  if (!COMPANY) document.dispatchEvent(new CustomEvent('taxidata:render'));

  } catch (e) {
    const el = document.getElementById('dashboard') || document.getElementById('content');
    if (el) el.textContent = 'Fel: ' + e.message;
  }
}

// Hjälpboten läser riktiga siffror härifrån (samma beräkning som Inkört/Mål ovan, bara läsning).
// tab: 'dag' | 'vecka' | 'manad'. Returnerar null om ingen data är hämtad ännu.
window.taxiStats = function (tab) {
  if (COMPANY || !data || !data.shifts) return null;
  tab = tab || 'dag';
  const now = new Date();
  const range = tab === 'vecka' ? [getWeekStart(now), getWeekEnd(now)]
    : tab === 'manad' ? [getMonthStart(now), getMonthEnd(now)] : [startOfDay(now), endOfDay(now)];
  const shifts = getShiftsInRange(range[0], range[1]);
  let trips = [];
  shifts.forEach(s => { trips = trips.concat(getTripsForShift(s)); });
  trips = trips.filter(t => t.kredittyp !== '999');
  const inkort = ['160', '283', '163', '1', '161', '185'].reduce((a, c) => a + sumByType(trips, c), 0)
    + sumByType(trips, '164') * (1 - UBER_FEE);
  const goal = goals[tab] || goals.dag;
  return { tab, inkort: Math.round(inkort), goal, diff: Math.round(inkort - goal), antal: trips.length,
           skift: shifts.length, own: viewDriver === currentDriver, viewing: currentTab, viewingCurrent: isCurrentPeriod() };
};
// Hämtar förarens data om den inte redan finns (t.ex. när boten frågas från hemskärmen)
window.taxiEnsureData = async function () {
  if (COMPANY) return;
  if (!data || !data.shifts) await loadData();
};

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
  else currentDate.setDate(currentDate.getDate() - 1);
  render();
};
document.getElementById('next').onclick = () => {
  if (isCurrentPeriod()) return;
  if (currentTab === 'period' && customRange) shiftPeriod(1);
  else if (currentTab === 'vecka') currentDate.setDate(currentDate.getDate() + 7);
  else if (currentTab === 'manad') currentDate.setMonth(currentDate.getMonth() + 1);
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
