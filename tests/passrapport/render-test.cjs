'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const src = fs.readFileSync('/tmp/taxikit-shop-passrapport/TaxiData/passrapport.js', 'utf8');
const ctx = { window: {}, console };
ctx.window = ctx;
vm.runInNewContext(src, ctx);
const { model, renderPaper } = ctx.window.PASSRAPPORT;

const fx = {
  ok: true, passnr: '12', forar: '710022', start: '2026-11-05 02:10',
  shift: { passnr: '12', forar: '710022', taxi: 'A191', start: '2026-11-05 02:10', slut: '2026-11-05 08:40' },
  file: {
    TAXINR: 'A191', ARBPASSNR: '12', ForarNr: '710022',
    PassStart: '202611050210', PassSlut: '202611050840',
    Ack_Inkort_tot_st: '1000.00', Ack_Inkort_tot_sl: '3500.00',
    Ack_Tot_km_tot_st: '10000.0', Ack_Tot_km_tot_sl: '10240.5',
    Antal_resor_i_passet: '3', InkortPass: '2500.00', TotKmPass: '240.5',
    TaxiKmPass: '180.0', BetKmPass: '175.2', DricksPass: '40.00',
    Rasttid_minuter: '30', NoLon: '0', InaktivTid: '15'
  },
  list: { 'Arbetad tid': '06:00', 'Aktiv tid körpass': '05:20', Rasttid: '00:30', 'Inaktiv tid': '00:15' },
  raw: { inkort: 2500, tot_km: 240.5, taxi_km: 180, bet_km: 175.2, dricks: 40, rasttid_min: 30, nolon: 0, inaktiv_min: 15, antal_resor: 3 },
  car: { bilnummer: 'A191', regnr: 'FJP04R' },
  trips: [
    { trip: { kvittonr: '030378-01', forar: '710022', startdatum: '2026-11-05', starttid: '02:24', sluttid: '02:35', kilometer: '5.4', belopp: '287', kredittyp: '160', dricks: '0' },
      raw: { MOMSTYP: '6', RESTID: '11', DAT_START: '20261105', TID_START: '0224', DAT_SLUT: '20261105', TID_SLUT: '0235' } },
    { trip: { kvittonr: '030379-01', forar: '710022', startdatum: '2026-11-05', starttid: '03:00', sluttid: '03:20', kilometer: '8', belopp: '100', kredittyp: '1' },
      raw: { MOMSTYP: '6' } }
  ]
};
const m = model(fx);
assert.equal(m.passnr, '12');
assert.equal(m.taxi, 'A191');
assert.equal(m.regnr, 'FJP04R');
assert.equal(m.forar, '710022');
assert.equal(m.start, '2026-11-05 02:10');
assert.equal(m.slut, '2026-11-05 08:40');
assert.equal(m.korda, 240.5);
assert.equal(m.betaldKm, 175.2);
assert.equal(m.upptagenKm, 180);
assert.equal(m.turer, 3);
assert.equal(m.inkort, 2500);
assert.equal(m.hasAck, true);
assert.ok(m.inloggadMin >= 380 && m.inloggadMin <= 400);
assert.equal(m.trips.length, 2);
assert.equal(m.trips[0].foljesedel, '030378-01');
assert.equal(m.kontant, 100);
assert.ok(m.kredit > 0);
const html = renderPaper(m);
for (const must of ['KÖRPASSRAPPORT KOPIA', '650 000', 'img/taxi-goteborg-logo.png', 'NR:', '12', 'REGNR:', 'FJP04R', 'FÖRARE:', '710022', 'TAXINR:', 'A191', 'PASS START:', 'PASS SLUT:', 'KÖRDA KM:', '240,5', 'BETALD KM:', 'UPPTAGEN KM:', 'TURER:', 'ACKUMULERADE TOTALER', 'KONTANT:', 'KREDIT:', 'MOMS:', 'LÖNEGRUNDANDE:', 'INKÖRT INKL MOMS EX RABATT:', '2 500,00'.replace(' ', '') /* may be 2500,00 */, 'KÖRPASSDATA', 'INLOGGAD:', 'RAST:', 'ARBETAD:', 'PASSETS RESOR', 'FÖLJESEDEL:', '030378-01', 'Stäng'] ) {
  if (must === 'Stäng') continue;
  if (must.startsWith('2 500')) {
    assert.ok(html.includes('2500,00'), 'inkort format');
    continue;
  }
  assert.ok(html.includes(must), 'missing ' + must);
}
assert.ok(!html.includes('Svenska Transportgruppen'));
assert.ok(!html.includes('FABRIKAT:'));
assert.ok(!html.includes('CERTIFIKAT:'));
assert.ok(!html.includes('KONST:'));
assert.ok(!html.includes('LEDIG MELLAN PASS:'));
assert.ok(!html.includes('RAPPORTNR:'));

const sparse = model({
  ok: true, passnr: '3', forar: '900001', start: '2026-11-01 10:00',
  shift: { passnr: '3', forar: '900001', taxi: 'A100', start: '2026-11-01 10:00', slut: '2026-11-01 12:00' }
});
const sh = renderPaper(sparse);
assert.ok(sh.includes('KÖRPASSRAPPORT KOPIA'));
assert.ok(sh.includes('650 000'));
assert.ok(sh.includes('PASS START:'));
assert.ok(!sh.includes('ACKUMULERADE TOTALER'));
assert.ok(!sh.includes('PASSETS RESOR'));
assert.ok(!sh.includes('Svenska Transportgruppen'));
assert.ok(!sh.includes('REGNR:'));
console.log('pass render-test ok');
