// Jämför gamla appens uträkning (main:s script.js, hela året + arkiv i klienten) med get_company_period-logiken
// (private.company_period, scope 'all'). Körs: TZ=Europe/Stockholm node compare.js script_main.js cur.json ark.json server.json
'use strict';
const fs = require('fs');
const [scriptPath, curPath, arkPath, ...srvPaths] = process.argv.slice(2);
const src = fs.readFileSync(scriptPath, 'utf8');
function extractFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('saknas: ' + name);
  let j = src.indexOf('{', i), depth = 0;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(i, j + 1);
}
function between(a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error(a); return src.slice(i, j); }
const uber = src.match(/const UBER_FEE = [^;]+;/)[0];
const fns = ['matchDriver', 'parseAmount', 'parseShiftTime', 'getShiftsInRange', 'getTripsForShift', 'tripTime',
  'getOrphanTripsInRange', 'sumByType', 'parseTime', 'formatTime', 'dedupData'].map(extractFn).join('\n');
const totalsBlock = between('let shifts = getShiftsInRange(rangeStart, rangeEnd);', 'const krPerKorning');
const factory = new Function(`
  let data = null, COMPANY = true, viewDriver = '', tripsByDriver = null, orphanTrips = null, currentTab = 'manad';
  ${uber}
  ${fns}
  return {
    load(d) { data = { trips: d.trips.slice(), shifts: d.shifts.slice() }; dedupData(data); tripsByDriver = null; orphanTrips = null; },
    totals(rangeStart, rangeEnd) {
      ${totalsBlock}
      const per = shifts.map(s => { const st = getTripsForShift(s);
        const u = st.filter(t => t.kredittyp === '164').reduce((a, t) => a + parseAmount(t.belopp), 0);
        const o = st.filter(t => t.kredittyp !== '999' && t.kredittyp !== '164').reduce((a, t) => a + parseAmount(t.belopp), 0);
        return [s.passnr, s.forar || '710022', s.start, o + u * (1 - UBER_FEE), st.length]; });
      return { t: { antal, km: totalKm, minutes: totalMinutes, shifts: antalSkift, kort, kredit, swish, kontant,
               uber: uberGross, faktura, ovrigt, bom, dricks, inkort }, per, loose: looseTrips.length };
    }
  };`);
const cur = JSON.parse(fs.readFileSync(curPath, 'utf8')), ark = JSON.parse(fs.readFileSync(arkPath, 'utf8'));
const app = factory(); app.load({ trips: cur.trips.concat(ark.trips), shifts: cur.shifts.concat(ark.shifts) });
const F = ['antal', 'km', 'minutes', 'shifts', 'kort', 'kredit', 'swish', 'kontant', 'uber', 'faktura', 'ovrigt', 'bom', 'dricks', 'inkort'];
const d = s => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
const res = { perioder: 0, avvikelser: [], pass_kontroll: 0, pass_avvik: [], los_avvik: [] , exakt_ore: 0};
for (const p of srvPaths) {
  const srv = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of srv) {
    const a = app.totals(d(r.from), new Date(d(r.to).getTime() + 86400000 - 1));
    res.perioder++;
    const diffs = [];
    let exact = true;
    for (const f of F) {
      const av = a.t[f], bv = Number(r.totals[f] || 0);
      if (Math.abs(av - bv) > 0.005) exact = false;
      if (Number.isNaN(av) || Math.round(av) !== Math.round(bv)) diffs.push(`${f}: gammal ${Math.round(av)} / ny ${Math.round(bv)}`);
    }
    if (exact) res.exakt_ore++;
    if (diffs.length) res.avvikelser.push(`${r.label}: ${diffs.join(', ')}`);
    if (Number(r.totals.loose_trips) !== a.loose) res.los_avvik.push(`${r.label}: gammal ${a.loose} / ny ${r.totals.loose_trips}`);
    if (r.shifts) {
      const m = new Map(r.shifts.map(s => [s[0] + '|' + s[1] + '|' + s[2], s]));
      for (const s of a.per) {
        res.pass_kontroll++;
        const k = s[0] + '|' + s[1] + '|' + s[2], b = m.get(k);
        if (!b) { res.pass_avvik.push(`${r.label} saknas på servern: ${k}`); continue; }
        m.delete(k);
        if (Math.abs(s[3] - Number(b[3])) > 0.005 || s[4] !== Number(b[4])) res.pass_avvik.push(`${r.label} ${k}: gammal ${s[3].toFixed(2)}/${s[4]} ny ${b[3]}/${b[4]}`);
      }
      for (const k of m.keys()) res.pass_avvik.push(`${r.label} bara på servern: ${k}`);
    }
  }
}
res.antal_avvikelser = res.avvikelser.length;
console.log(JSON.stringify(res, null, 1));
