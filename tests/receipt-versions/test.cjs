const assert = require("assert");
const rv = require("../../TaxiData/receipt-versions.js");

assert.equal(rv.receiptBase("030185-01"), "030185");
assert.equal(rv.receiptSuffix("030185-04"), 4);
assert.equal(rv.receiptSuffix("030185-10"), 10);
assert.equal(rv.receiptBase("saknas"), "");

const live = { kvittonr: "100001-05", forar: "710022", startdatum: "2026-04-01", belopp: "220,00" };
const pool = [
  { kvittonr: "100001-01", forar: "710022", startdatum: "2026-04-01", belopp: "180,00" },
  { kvittonr: "100001-02", forar: "710022", startdatum: "2026-04-01", belopp: "200,00" },
  { kvittonr: "100001-04", forar: "710022", startdatum: "2026-04-01", belopp: "210,00" },
  { kvittonr: "100001-05", forar: "710022", startdatum: "2026-04-01", belopp: "220,00" },
  { kvittonr: "100001-03", forar: "999999", startdatum: "2026-04-01", belopp: "1,00" },
  { kvittonr: "100001-03", forar: "710022", startdatum: "2026-05-01", belopp: "1,00" },
  { kvittonr: "200000-01", forar: "710022", startdatum: "2026-04-01", belopp: "1,00" }
];
const old = rv.replacedVersionsFor(live, pool, "710022");
assert.deepEqual(old.map(r => r.kvittonr), ["100001-01", "100001-02", "100001-04"]);
assert.equal(old.length, 3);
assert.equal(rv.replacedVersionsFor(live, [], "710022").length, 0);
console.log("receipt-versions: ok");
