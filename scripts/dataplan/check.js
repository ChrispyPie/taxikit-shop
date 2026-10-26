// Dataplan steg 0 – kontroll: jämför private.day_summary (förare × månad + åkeri) med appens egen
// beräkning. Appens funktioner läses ordagrant ur TaxiData/script.js (ingen omskrivning).
// Körs: TZ=Europe/Stockholm node check.js <script.js> <current.json> <arkiv.json> <day_summary_month.json>
// Data hämtas med SQL (se README i PR); inga nycklar används här.
'use strict';
const fs = require('fs');
const [scriptPath, curPath, arkPath, dsPath] = process.argv.slice(2);
const src = fs.readFileSync(scriptPath, 'utf8');

function extractFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('saknas: ' + name);
  let j = src.indexOf('{', i), depth = 0;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(i, j + 1);
}
function between(a, b, inclB) {
  const i = src.indexOf(a); const j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('markör saknas: ' + a);
  return src.slice(i, inclB ? j + b.length : j);
}
const uber = src.match(/const UBER_FEE = [^;]+;/)[0];
const fns = ['matchDriver', 'parseAmount', 'parseShiftTime', 'getShiftsInRange', 'getTripsForShift', 'tripTime',
  'getOrphanTripsInRange', 'sumByType', 'parseTime', 'formatTime'].map(extractFn).join('\n');
// Dubblettfiltret: nyare script.js har det som funktionen dedupData(d), äldre hade det inne i loadData().
const dedupe = src.includes('function dedupData(')
  ? extractFn('dedupData') + '\n dedupData(data);'
  : between('const seenShifts = new Set();', 'data.trips = (data.trips || []).filter(')
    + between('data.trips = (data.trips || []).filter(', '});', true);
const totalsBlock = between('let shifts = getShiftsInRange(rangeStart, rangeEnd);', 'const krPerKorning');

const factory = new Function(`
  let data = null, COMPANY = false, viewDriver = '', tripsByDriver = null, orphanTrips = null, currentTab = 'manad';
  ${uber}
  ${fns}
  return {
    load(d) { data = { trips: d.trips.slice(), shifts: d.shifts.slice() }; ${dedupe}
      tripsByDriver = null; orphanTrips = null; return data; },
    set(company, drv) { COMPANY = company; viewDriver = drv; },
    totals(rangeStart, rangeEnd) {
      ${totalsBlock}
      return { antal, km: totalKm, minutes: totalMinutes, shifts: antalSkift, kort, kredit, swish, kontant,
               uber: uberGross, faktura, ovrigt, bom, dricks, inkort };
    }
  };`);

const cur = JSON.parse(fs.readFileSync(curPath, 'utf8'));
const ark = JSON.parse(fs.readFileSync(arkPath, 'utf8'));
const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8'));

// Appens data i dag (current) plus arkivet, i samma ordning som klienten slår ihop dem (current först).
const merged = { trips: cur.trips.concat(ark.trips), shifts: cur.shifts.concat(ark.shifts) };
const variants = { app_current_plus_arkiv: merged };

const db = {};
const add = (k, r) => { const o = db[k] = db[k] || {}; for (const f of FIELDS) o[f] = (o[f] || 0) + Number(r[f] || 0); };
const FIELDS = ['antal', 'km', 'minutes', 'shifts', 'kort', 'kredit', 'swish', 'kontant', 'uber', 'faktura', 'ovrigt', 'bom', 'dricks', 'inkort'];
for (const r of ds) { add(r.forar + '|' + r.ym, r); add('ÅKERI|' + r.ym, r); }
const months = [...new Set(ds.map(r => r.ym))].sort();
const drivers = [...new Set(merged.trips.map(t => t.forar || '710022').concat(merged.shifts.map(s => s.forar || '710022')))].sort();

const out = {};
for (const [name, d] of Object.entries(variants)) {
  const app = factory(); app.load(d);
  const mism = []; let cells = 0;
  for (const who of drivers.concat(['ÅKERI'])) {
    if (who === 'ÅKERI') app.set(true, ''); else app.set(false, who);
    for (const ym of months) {
      const [y, m] = ym.split('-').map(Number);
      const a = app.totals(new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59));
      const b = db[who + '|' + ym] || {};
      cells++;
      const diffs = [];
      for (const f of FIELDS) {
        const av = Math.round(a[f]), bv = Math.round(b[f] || 0);
        if (Number.isNaN(a[f]) || av !== bv) diffs.push(`${f}: app ${Number.isNaN(a[f]) ? 'NaN' : av} / server ${bv}`);
      }
      if (diffs.length) mism.push(`${who} ${ym}: ${diffs.join(', ')}`);
    }
  }
  out[name] = { celler: cells, avvikelser: mism.length, detaljer: mism };
}
// Månader i current där appens siffror ändras när arkivet läggs till (pass över årsskiftet o.d.)
{
  const a1 = factory(); a1.load(cur); a1.set(true, '');
  const a2 = factory(); a2.load(merged); a2.set(true, '');
  const curMonths = [...new Set(cur.trips.map(t => t.startdatum.slice(0, 7)))].sort();
  out.current_vs_merged = curMonths.filter(ym => {
    const [y, m] = ym.split('-').map(Number);
    const r = [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59)];
    const x = a1.totals(...r), z = a2.totals(...r);
    return FIELDS.some(f => Math.round(x[f]) !== Math.round(z[f]));
  });
}
console.log(JSON.stringify({ forare: drivers.length, manader: months.length, ...out }, null, 1));
