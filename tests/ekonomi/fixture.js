// Påhittad men realistisk data i samma form som servern (ekonomi_period) svarar. Används av testerna.
module.exports = {
  from: '2026-01-01', to: '2026-12-31', rate: 112.43, named: true,
  cfg: { sjuklon_pct: 80, karens_pct: 20, sjuklon_dagar: 14, snitt_man: 6, provision: 37 },
  verkstad: [
    { driver_id: '472245', namn: 'Richard D.', mon: '2026-10-01', approved_min: 270, approved_kr: 504, pending_min: 0, rejected_min: 0 },
    { driver_id: '179629', namn: 'Matte T.', mon: '2026-10-01', approved_min: 35, approved_kr: 65, pending_min: 0, rejected_min: 90 },
    { driver_id: '169327', namn: 'Gebrail I.', mon: '2026-10-01', approved_min: 60, approved_kr: 112, pending_min: 0, rejected_min: 0 },
    { driver_id: '710022', namn: 'Christian P.', mon: '2026-10-01', approved_min: 0, approved_kr: 0, pending_min: 0, rejected_min: 60 },
    { driver_id: '179629', namn: 'Matte T.', mon: '2026-11-01', approved_min: 150, approved_kr: 281, pending_min: 0, rejected_min: 0 },
    { driver_id: '472245', namn: 'Richard D.', mon: '2026-11-01', approved_min: 270, approved_kr: 506, pending_min: 0, rejected_min: 0 }
  ],
  sjuk: [
    { driver_id: '472245', namn: 'Richard D.', mon: '2026-10-01', period_id: 10, dagar: 4, brutto: 1821.27, karens: 637.45, kr: 1183.82 },
    { driver_id: '472245', namn: 'Richard D.', mon: '2026-11-01', period_id: 10, dagar: 4, brutto: 1821.27, karens: 0, kr: 1821.27 }
  ],
  perioder: [
    { id: 10, driver_id: '472245', namn: 'Richard D.', start: '2026-10-28', end: '2026-11-04', open: false, dagar: 8, agare_dagar: 8, status: 'godkand', sjuklon: 'beviljad', counted: true, kr: 3005.1, sparat: true, karens: 637.45, ingen_data: false, certs: 1 },
    { id: 1, driver_id: '710022', namn: 'Christian P.', start: '2026-10-29', end: null, open: true, dagar: 30, agare_dagar: 14, status: 'avslagen', sjuklon: 'ej', counted: false, kr: null, sparat: false, karens: null, ingen_data: false, certs: 2 }
  ]
};
