'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const src = fs.readFileSync('/tmp/taxikit-shop-kvitto/TaxiData/kvittokopia.js', 'utf8');
const ctx = { window: {}, console };
ctx.window = ctx;
vm.runInNewContext(src, ctx);
const { model, renderPaper } = ctx.window.KVITTO;

const stig = {
  ok: true,
  kvittonr: '030378-01',
  forar: '710022',
  startdatum: '2026-11-05',
  trip: {
    kvittonr: '030378-01', forar: '710022', taxi: 'A191',
    startzon: '103', slutzon: '10', kilometer: '5.4', kredittyp: '160',
    belopp: '287', starttid: '02:24', sluttid: '02:35', startdatum: '2026-11-05'
  },
  raw: {
    BOOKNR: '10647', MOMSTYP: '6', TAXINR: 'A191', RESTID: '11', KILOMETER: '54',
    KREDITTYP: '160', STARTZON: '103', SLUTZON: '10',
    DAT_START: '20261105', TID_START: '0224', DAT_SLUT: '20261105', TID_SLUT: '0235',
    TABELL: '60', TAXAMETERBELOPP: '287', DEBITERAS: '287'
  },
  detail: {
    Startavgift: '61', taxanamn: 'ORDINARIE', kmdeb: '5,40', tideb: '11', kr: '214,49', admavgift: '12'
  },
  car: { bilnummer: 'A191', regnr: 'FJP04R' }
};

const m = model(stig);
assert.equal(m.kvittonr, '030378-01');
assert.equal(m.typKod, '160');
assert.match(m.typRad, /EMV Magnetkort/);
assert.equal(m.taxi, 'A191');
assert.equal(m.regnr, 'FJP04R');
assert.equal(m.forar, '710022');
assert.equal(m.booknr, '10647');
assert.equal(m.startzon, '103');
assert.equal(m.slutzon, '10');
assert.equal(m.start, '2026-11-05 02:24');
assert.equal(m.slut, '2026-11-05 02:35');
assert.equal(m.tid, '00:11');
assert.equal(m.dist, '5,4');
assert.equal(m.startavgift, 61);
assert.equal(m.taxaNamn, 'ORDINARIE');
assert.equal(m.adm, 12);
assert.equal(m.summa, 287);
assert.equal(m.eur, null);
assert.equal(m.bolag, '');
assert.equal(m.momsProc, 6);
assert.equal(m.netto, 270.75);
assert.equal(m.moms, 16.25);
assert.equal(m.taxeversion, '60');
assert.equal(m.versionsnr, '');

const html = renderPaper(m);
for (const must of ['KVITTOKOPIA', 'NR: 030378-01', 'EMV Magnetkort', '160', 'TAXINUMMER:', 'A191', 'REGNR:', 'FJP04R', 'FÖRARE:', '710022', 'BOKN.NR:', '10647', 'STARTZON:', '103', 'SLUTZON:', '10', '2026-11-05 02:24', '2026-11-05 02:35', '00:11', '5,4 km', 'STARTAVGIFT', '61,00', 'ORDINARIE', '5,40', 'ADM AVGIFT', '12,00', 'TX. PRIS', '287,00', 'SUMMA', '6', '270,75', '16,25', 'TAXEVERSION:', '60', '650 000', 'Taxi Göteborg', 'Underskrift', 'img/taxi-goteborg-logo.png']) {
  assert.ok(html.includes(must), 'missing: ' + must);
}
for (const mustNot of ['Svenska Transportgruppen', 'EUR', 'VERSIONSNR', 'Baron', 'HISINGS']) {
  assert.ok(!html.includes(mustNot), 'should hide: ' + mustNot);
}

const sparse = model({
  ok: true, kvittonr: '000111-01', forar: '900001', startdatum: '2026-11-01',
  trip: { kvittonr: '000111-01', forar: '900001', kredittyp: '1', belopp: '100', startdatum: '2026-11-01', starttid: '10:00', sluttid: '10:20' }
});
assert.equal(sparse.typRad.includes('Kontant'), true);
assert.equal(sparse.summa, 100);
assert.equal(sparse.startavgift, null);
assert.equal(sparse.booknr, '');
assert.equal(sparse.eur, null);
assert.equal(sparse.regnr, '');
const sparseHtml = renderPaper(sparse);
assert.ok(sparseHtml.includes('SUMMA'));
assert.ok(sparseHtml.includes('Kontant'));
assert.ok(!sparseHtml.includes('STARTAVGIFT'));
assert.ok(!sparseHtml.includes('BOKN.NR:'));
assert.ok(!sparseHtml.includes('REGNR:'));
assert.ok(!sparseHtml.includes('EUR'));
assert.ok(!sparseHtml.includes('Svenska Transportgruppen'));
console.log('render-test ok');
