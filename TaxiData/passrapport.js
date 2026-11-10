/* Taxi Göteborg KÖRPASSRAPPORT KOPIA. Termostrip, samma logo som kvittot.
   Hämtar ETT pass först när föraren öppnar rapporten (ikon eller rad).
   Samma miniatyr för alla rader — ingen data bakas in i ikonen. */
(function () {
  const PAY = {
    '160': 'KORT', '163': 'SWISH', '1': 'KONTANT', '164': 'UBER',
    '161': 'FAKTURA', '283': 'KREDIT', '185': 'ÖVRIGT', '999': 'BOM'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function empty(v) {
    if (v == null) return true;
    const s = String(v).trim();
    return s === '' || s === '-' || s === 'null' || s === 'undefined';
  }
  function normKey(k) {
    return String(k || '').replace(/[\s_\-]+/g, '').toLowerCase();
  }
  function pick(bags, names) {
    const want = names.map(normKey);
    for (const bag of bags) {
      if (!bag || typeof bag !== 'object') continue;
      for (const [k, v] of Object.entries(bag)) {
        if (empty(v)) continue;
        if (want.includes(normKey(k))) return String(v).trim();
      }
    }
    return '';
  }
  function num(raw) {
    if (empty(raw)) return null;
    const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  function kr(n) {
    if (n == null || !Number.isFinite(n)) return '';
    return n.toFixed(2).replace('.', ',');
  }
  function km(n) {
    if (n == null || !Number.isFinite(n)) return '';
    return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function hm(min) {
    if (min == null || !Number.isFinite(min)) return '';
    const m = Math.round(min);
    const sign = m < 0 ? '-' : '';
    const a = Math.abs(m);
    return sign + pad2(Math.floor(a / 60)) + ':' + pad2(a % 60);
  }
  function parseStamp(s) {
    if (empty(s)) return null;
    const t = String(s).trim();
    let m = t.replace(/\s+/g, '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    m = t.match(/^(\d{4})(\d{2})(\d{2})[ T]+(\d{1,2}):?(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
    if (m) return new Date(m[1] + 'T' + pad2(m[2]) + ':' + m[3]);
    const d = new Date(t);
    return isNaN(d) ? null : d;
  }
  function fmtStamp(s) {
    const d = s instanceof Date ? s : parseStamp(s);
    if (!d) return empty(s) ? '' : String(s).trim();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function minutesBetween(a, b) {
    const x = a instanceof Date ? a : parseStamp(a);
    const y = b instanceof Date ? b : parseStamp(b);
    if (!x || !y) return null;
    return Math.round((y - x) / 60000);
  }
  function bagsOf(d) {
    return [d.raw, d.file, d.list, d.shift, d.car].filter(Boolean);
  }

  function model(d) {
    const b = bagsOf(d);
    const passnr = pick(b, ['arbpassnr', 'passnr', 'passnummer']) || d.passnr || '';
    const forar = pick(b, ['forar', 'forarnr', 'förar id', 'forarid']) || d.forar || '';
    const taxi = pick(b, ['taxi', 'taxinr', 'taxinummer', 'bilnummer']);
    const regnr = pick(b, ['regnr', 'registreringsnummer']);
    const bolag = pick(b, ['bolag', 'akeri', 'företag', 'foretag', 'orgnamn', 'bolagsnamn']);
    const orgnr = pick(b, ['orgnr', 'org.nr', 'organisationsnummer']);
    const fabrikat = pick(b, ['fabrikat', 'taxameter', 'meterfabrikat']);
    const meterId = pick(b, ['meterid', 'taxameterid', 'id']);
    const cert = pick(b, ['certifikat', 'certnr', 'certifikatnr']);
    const konst = pick(b, ['konst', 'konstatering', 'kontrollmärke', 'kontrollmarke']);
    const rapportnr = pick(b, ['rapportnr', 'rapportnummer']);

    const start = fmtStamp(pick(b, ['passstart', 'pass start', 'start', 'pass_start']) || d.start);
    const slut = fmtStamp(pick(b, ['passslut', 'pass slut', 'slut', 'pass_slut']));
    const korda = num(pick(b, ['totkmpass', 'tot_km', 'kordakm', 'km']));
    const betaldKm = num(pick(b, ['betkmpass', 'bet_km', 'betaldkm']));
    const upptagenKm = num(pick(b, ['taxikmpass', 'taxi_km', 'upptagenkm']));
    const turer = num(pick(b, ['antal_resor_i_passet', 'antal_resor', 'ant.resor', 'resor']));
    const inkort = num(pick(b, ['inkortpass', 'inkort']));
    const dricks = num(pick(b, ['drickspass', 'dricks']));
    const nolon = num(pick(b, ['nolon']));
    const rastMin = num(pick(b, ['rasttid_minuter', 'rasttid', 'rast']));
    const inaktivMin = num(pick(b, ['inaktivtid', 'inaktiv_min', 'inaktiv tid', 'inaktiv']));
    const arbetadList = pick(b, ['arbetad tid', 'arbetad']);
    const aktivList = pick(b, ['aktiv tid körpass', 'aktiv tid', 'betald tid']);
    const kmBefore = num(pick(b, ['kmbeforepass']));
    const antalPass = pick(b, ['antalpass']);

    const ack = {
      inkortSt: num(pick(b, ['ack_inkort_tot_st'])),
      totSt: num(pick(b, ['ack_tot_km_tot_st'])),
      taxiSt: num(pick(b, ['ack_taxi_km_tot_st'])),
      betSt: num(pick(b, ['ack_bet_km_tot_st'])),
      driSt: num(pick(b, ['ack_dricks_tot_st'])),
      inkortSl: num(pick(b, ['ack_inkort_tot_sl'])),
      totSl: num(pick(b, ['ack_tot_km_tot_sl'])),
      taxiSl: num(pick(b, ['ack_taxi_km_tot_sl'])),
      betSl: num(pick(b, ['ack_bet_km_tot_sl'])),
      driSl: num(pick(b, ['ack_dricks_tot_sl']))
    };
    const hasAck = Object.values(ack).some(v => v != null);

    const inloggadMin = minutesBetween(start, slut);
    let arbetad = arbetadList;
    if (empty(arbetad) && inloggadMin != null && rastMin != null) {
      const m = inloggadMin - rastMin - (inaktivMin || 0);
      if (m >= 0) arbetad = hm(m);
    }
    const aktiv = aktivList;
    const inkortPerMil = (inkort != null && korda && korda > 0) ? inkort / (korda / 10) : null;
    let workMin = null;
    if (!empty(arbetad) && /^\d{1,2}:\d{2}/.test(String(arbetad))) {
      const p = String(arbetad).split(':');
      workMin = (+p[0]) * 60 + (+p[1]);
    } else if (inloggadMin != null && rastMin != null) {
      workMin = inloggadMin - rastMin - (inaktivMin || 0);
    }
    const inkortPerTim = (inkort != null && workMin && workMin > 0) ? inkort / (workMin / 60) : null;
    const lonegrund = (inkort != null && nolon != null) ? Math.round((inkort - nolon) * 100) / 100 : (nolon == null ? inkort : null);

    const trips = (d.trips || []).map((row, i, arr) => {
      const tb = [row.trip, row.raw].filter(Boolean);
      const startT = fmtStamp(pick(tb, ['startdatum']) && pick(tb, ['starttid'])
        ? (pick(tb, ['dat_start', 'startdatum']) + ' ' + pick(tb, ['tid_start', 'starttid']))
        : pick(tb, ['dat_start', 'start']));
      const startAlt = fmtStamp(
        (pick(tb, ['startdatum']) || '') + ' ' + (pick(tb, ['starttid']) || '')
      ) || fmtStamp(pick(tb, ['dat_start']) && pick(tb, ['tid_start'])
        ? pick(tb, ['dat_start']) + pick(tb, ['tid_start'])
        : '');
      const st = startT && startT.length > 8 ? startT : startAlt;
      const sl = fmtStamp(
        (pick(tb, ['dat_slut', 'slutdatum']) || pick(tb, ['startdatum']) || '') + ' ' +
        (pick(tb, ['tid_slut', 'sluttid']) || '')
      );
      let tid = pick(tb, ['restid', 'tidsatgang']);
      if (empty(tid)) {
        const m = minutesBetween(st, sl);
        if (m != null) tid = hm(m);
      } else if (/^\d+$/.test(tid) && +tid < 600) {
        tid = hm(+tid);
      }
      let dist = num(pick([row.trip].filter(Boolean), ['kilometer', 'km']));
      if (dist == null) {
        const rawKm = num(pick([row.raw].filter(Boolean), ['kilometer', 'km']));
        if (rawKm != null) dist = (Number.isInteger(rawKm) && rawKm >= 10) ? rawKm / 10 : rawKm;
      }
      const pris = num(pick(tb, ['belopp', 'debiteras', 'taxameterbelopp']));
      const dri = num(pick(tb, ['dricks']));
      const typ = pick(tb, ['kredittyp']);
      const taxa = pick(tb, ['taxanamn', 'taxaname', 'tabell']);
      let moms = num(pick(tb, ['moms', 'momsbelopp']));
      const momsTyp = pick(tb, ['momstyp']);
      if (moms == null && pris != null && !empty(momsTyp)) {
        const mm = String(momsTyp).replace(',', '.').match(/(\d+(?:\.\d+)?)/);
        let proc = null;
        if (mm) {
          const x = parseFloat(mm[1]);
          if (x === 1 || x === 6) proc = 6;
          else if (x === 2 || x === 12) proc = 12;
          else if (x === 3 || x === 25) proc = 25;
          else if (x === 0) proc = 0;
          else if (x > 3 && x <= 25) proc = x;
        }
        if (proc != null) {
          const netto = Math.round((pris / (1 + proc / 100)) * 100) / 100;
          moms = Math.round((pris - netto) * 100) / 100;
        }
      }
      let ledigTid = '', ledigKm = '';
      if (i === 0 && start && st) {
        const m = minutesBetween(start, st);
        if (m != null && m >= 0) ledigTid = hm(m);
      } else if (i > 0) {
        const prev = arr[i - 1];
        const pb = [prev.trip, prev.raw].filter(Boolean);
        const prevSl = fmtStamp(
          (pick(pb, ['dat_slut', 'slutdatum']) || pick(pb, ['startdatum']) || '') + ' ' +
          (pick(pb, ['tid_slut', 'sluttid']) || '')
        );
        const m = minutesBetween(prevSl, st);
        if (m != null && m >= 0) ledigTid = hm(m);
      }
      return {
        foljesedel: pick(tb, ['kvittonr', 'kvitto']),
        start: st, slut: sl, tid, dist, taxa, pris, dricks: dri, moms,
        typ, ledigTid, ledigKm
      };
    });

    const kontant = trips.filter(t => t.typ === '1').reduce((s, t) => s + (t.pris || 0), 0);
    const kredit = trips.filter(t => t.typ && t.typ !== '1' && t.typ !== '999').reduce((s, t) => s + (t.pris || 0), 0);
    const momsSum = trips.reduce((s, t) => s + (t.moms || 0), 0);
    const hasPay = trips.some(t => t.pris != null);

    return {
      passnr, forar, taxi, regnr, bolag, orgnr, fabrikat, meterId, cert, konst, rapportnr, antalPass,
      start, slut, korda, betaldKm, upptagenKm, turer, inkort, dricks, nolon, lonegrund,
      rastMin, inaktivMin, arbetad, aktiv, inloggadMin, inkortPerMil, inkortPerTim, kmBefore,
      ack, hasAck, trips, kontant: hasPay ? kontant : null, kredit: hasPay ? kredit : null,
      momsSum: trips.some(t => t.moms != null) ? momsSum : null
    };
  }

  function line(label, value) {
    if (empty(value)) return '';
    return '<div class="pr-row"><span class="pr-k">' + esc(label) + '</span><span class="pr-v">' + esc(value) + '</span></div>';
  }
  function head(title) { return '<div class="pr-h">' + esc(title) + '</div>'; }
  function rule() { return '<div class="pr-rule" aria-hidden="true"></div>'; }

  function renderPaper(m) {
    const company = [m.bolag, m.orgnr ? 'ORG.NR ' + m.orgnr : ''].filter(s => !empty(s)).map(s => '<div>' + esc(s) + '</div>').join('');
    const header =
      line('NR:', m.passnr) +
      (company ? '<div class="pr-co">' + company + '</div>' : '') +
      line('REGNR:', m.regnr) +
      line('FÖRARE:', m.forar) +
      line('TAXINR:', m.taxi) +
      line('FABRIKAT:', m.fabrikat) +
      line('ID:', m.meterId) +
      line('CERTIFIKAT:', m.cert);

    const taxameter =
      line('KONST:', m.konst) +
      line('PASS START:', m.start) +
      line('PASS SLUT:', m.slut) +
      line('KÖRDA KM:', m.korda != null ? km(m.korda) : '') +
      line('BETALD KM:', m.betaldKm != null ? km(m.betaldKm) : '') +
      line('UPPTAGEN KM:', m.upptagenKm != null ? km(m.upptagenKm) : '') +
      line('TURER:', m.turer != null ? String(Math.round(m.turer)) : '');

    let ack = '';
    if (m.hasAck) {
      const rows = [
        ['INKÖRT', m.ack.inkortSt, m.ack.inkortSl, true],
        ['TOT KM', m.ack.totSt, m.ack.totSl, false],
        ['TAXI KM', m.ack.taxiSt, m.ack.taxiSl, false],
        ['BET KM', m.ack.betSt, m.ack.betSl, false],
        ['DRICKS', m.ack.driSt, m.ack.driSl, true]
      ].filter(r => r[1] != null || r[2] != null);
      if (rows.length) {
        ack = head('ACKUMULERADE TOTALER') +
          '<div class="pr-ack-h"><span></span><span>STÅND</span><span>SLUT</span></div>' +
          rows.map(r => '<div class="pr-ack"><span>' + esc(r[0]) + '</span><span>' +
            esc(r[1] != null ? (r[3] ? kr(r[1]) : km(r[1])) : '') + '</span><span>' +
            esc(r[2] != null ? (r[3] ? kr(r[2]) : km(r[2])) : '') + '</span></div>').join('');
      }
    }

    const pay =
      (m.kontant != null ? line('KONTANT:', kr(m.kontant)) : '') +
      (m.kredit != null ? line('KREDIT:', kr(m.kredit)) : '') +
      (m.momsSum != null ? line('MOMS:', kr(m.momsSum)) : '');

    const ids =
      line('RAPPORTNR:', m.rapportnr) +
      line('ANTAL PASS:', m.antalPass);

    const lon =
      (m.lonegrund != null ? line('LÖNEGRUNDANDE:', kr(m.lonegrund)) : '') +
      (m.nolon != null ? line('EJ LÖNEGRUNDANDE:', kr(m.nolon)) : '');

    const inkortLine = m.inkort != null ? line('INKÖRT INKL MOMS EX RABATT:', kr(m.inkort)) : '';

    const korpass =
      line('INKÖRT:', m.inkort != null ? kr(m.inkort) : '') +
      line('INKÖRT/MIL:', m.inkortPerMil != null ? kr(m.inkortPerMil) : '') +
      line('INKÖRT/TIM:', m.inkortPerTim != null ? kr(m.inkortPerTim) : '') +
      line('INLOGGAD:', m.inloggadMin != null ? hm(m.inloggadMin) : '') +
      line('RAST:', m.rastMin != null ? hm(m.rastMin) : '') +
      line('ARBETAD:', m.arbetad) +
      line('BETALD:', m.aktiv) +
      line('INAKTIV:', m.inaktivMin != null ? hm(m.inaktivMin) : '') +
      line('LEDIG MELLAN PASS:', '') +
      (m.kmBefore != null ? line('KM FÖRE PASS:', km(m.kmBefore)) : '');

    let resor = '';
    if (m.trips && m.trips.length) {
      resor = head('PASSETS RESOR') + m.trips.map((t, i) => {
        const ledig = (t.ledigTid || t.ledigKm)
          ? line('LEDIG:', [t.ledigTid, t.ledigKm ? t.ledigKm + ' km' : ''].filter(Boolean).join('  '))
          : '';
        return '<div class="pr-trip">' +
          '<div class="pr-trip-n">RESA ' + (i + 1) + '</div>' +
          ledig +
          line('FÖLJESEDEL:', t.foljesedel) +
          line('START:', t.start) +
          line('SLUT:', t.slut) +
          line('TIDSÅTGÅNG:', t.tid) +
          line('KÖRSTRÄCKA:', t.dist != null ? km(t.dist) + ' km' : '') +
          line('TAXA:', t.taxa) +
          line('PRIS:', t.pris != null ? kr(t.pris) : '') +
          line('DRICKS:', t.dricks != null ? kr(t.dricks) : '') +
          line('MOMS:', t.moms != null ? kr(t.moms) : '') +
          '</div>';
      }).join('');
    }

    return (
      '<div class="pr-paper" role="document" aria-label="Körpassrapport kopia">' +
        '<div class="pr-tear pr-tear-top" aria-hidden="true"></div>' +
        '<div class="pr-inner">' +
          '<div class="pr-brand">' +
            '<img class="pr-logo" src="img/taxi-goteborg-logo.png" alt="Taxi Göteborg" width="108" height="126">' +
            '<div class="pr-phone">650 000</div>' +
          '</div>' +
          head('KÖRPASSRAPPORT KOPIA') +
          header +
          (taxameter ? (rule() + taxameter) : '') +
          (ack ? (rule() + ack) : '') +
          (pay ? (rule() + pay) : '') +
          (ids ? (rule() + ids) : '') +
          (lon ? (rule() + lon) : '') +
          (inkortLine ? (rule() + inkortLine) : '') +
          (korpass ? (rule() + head('KÖRPASSDATA') + korpass) : '') +
          (resor ? (rule() + resor) : '') +
        '</div>' +
        '<div class="pr-tear pr-tear-bot" aria-hidden="true"></div>' +
      '</div>'
    );
  }

  function overlay() {
    let el = document.getElementById('pr-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pr-overlay';
    el.className = 'pr-overlay';
    el.setAttribute('hidden', '');
    el.innerHTML =
      '<div class="pr-dialog" role="dialog" aria-modal="true" aria-labelledby="pr-dialog-title">' +
        '<h2 id="pr-dialog-title" class="pr-visually-hidden">Körpassrapport kopia</h2>' +
        '<div class="pr-scroll"><div class="pr-body"></div></div>' +
        '<div class="pr-actions"><button type="button" class="pr-close">Stäng</button></div>' +
      '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    el.querySelector('.pr-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.hasAttribute('hidden')) close();
    });
    document.body.appendChild(el);
    return el;
  }
  function setBody(html) { overlay().querySelector('.pr-body').innerHTML = html; }
  async function rpcCall(passnr, start, forar) {
    const args = { p_passnr: passnr, p_start: start || null, p_forar: forar || null };
    if (typeof tripRpc === 'function') return tripRpc('get_pass_receipt', args);
    if (typeof rpc === 'function') return rpc('get_pass_receipt', args);
    throw new Error('rpc missing');
  }
  async function open(passnr, forar, start) {
    const el = overlay();
    el.removeAttribute('hidden');
    document.body.classList.add('pr-open');
    setBody('<div class="pr-paper pr-loading">Hämtar passrapport…</div>');
    try {
      const data = await rpcCall(passnr, start, forar);
      if (!data || data.ok === false) {
        setBody('<div class="pr-paper pr-err">Kunde inte hämta passrapporten.</div>');
        return;
      }
      setBody(renderPaper(model(data)));
    } catch (err) {
      setBody('<div class="pr-paper pr-err">Kunde inte hämta passrapporten.</div>');
    }
  }
  function openFromRow(row, ev) {
    if (ev) ev.stopPropagation();
    if (!row) return;
    open(row.getAttribute('data-passnr') || '', row.getAttribute('data-forar') || '', row.getAttribute('data-start') || '');
  }
  function close() {
    const el = document.getElementById('pr-overlay');
    if (el) el.setAttribute('hidden', '');
    document.body.classList.remove('pr-open');
  }
  window.PASSRAPPORT = { open, openFromRow, close, model, renderPaper };
})();
