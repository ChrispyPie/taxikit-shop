/* Rättade kvitton: gruppera äldre versioner (-01, -02, …) under den gällande.
   Ren logik, ingen DOM. Används av Körpassdata/Åkeridata. */
(function (root) {
  function receiptBase(kvitto) {
    var m = String(kvitto || "").match(/^(\d+)-(\d+)$/);
    return m ? m[1] : "";
  }
  function receiptSuffix(kvitto) {
    var m = String(kvitto || "").match(/^(\d+)-(\d+)$/);
    return m ? parseInt(m[2], 10) : 0;
  }
  function replacedVersionsFor(t, pool, defForar) {
    var src = pool || [];
    var base = receiptBase(t && t.kvittonr);
    if (!base) return [];
    var forar = (t && t.forar) || defForar || "";
    var day = (t && t.startdatum) || "";
    return src.filter(function (r) {
      return receiptBase(r.kvittonr) === base
        && ((r.forar || defForar || "") === forar)
        && ((r.startdatum || "") === day)
        && r.kvittonr !== t.kvittonr;
    }).sort(function (a, b) {
      return receiptSuffix(a.kvittonr) - receiptSuffix(b.kvittonr);
    });
  }
  var api = { receiptBase: receiptBase, receiptSuffix: receiptSuffix, replacedVersionsFor: replacedVersionsFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ReceiptVersions = api;
})(typeof window !== "undefined" ? window : globalThis);
