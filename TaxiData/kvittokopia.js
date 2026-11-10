/* Taxi Göteborg KVITTOKOPIA. Visuell kopia av reseunderlaget.
   Hämtar EN resa först när föraren öppnar kvittot (ikon eller rad).
   Samma miniatyr för alla rader — ingen data bakas in i ikonen. */
(function () {
  const PAY = {
    '160': 'EMV Magnetkort',
    '163': 'Swish',
    '1': 'Kontant',
    '164': 'Uber',
    '161': 'Faktura',
    '283': 'Kredit',
    '185': 'Övrigt',
    '999': 'BOM'
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
    return String(k || '')
      .replace(/^(tb_valdresa_|ddl_valdresa_|MainContent_[^_]*_?)/i, '')
      .replace(/[\s_\-]+/g, '')
      .toLowerCase();
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

  function kr(n, decimals) {
    if (n == null || !Number.isFinite(n)) return '';
    const d = decimals == null ? 2 : decimals;
    return n.toFixed(d).replace('.', ',');
  }

  function fmtDateYmd(s) {
    if (empty(s)) return '';
    const t = String(s).trim();
    const m8 = t.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m8) return m8[1] + '-' + m8[2] + '-' + m8[3];
    const m10 = t.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m10) return m10[1];
    return t;
  }

  function fmtTime(s) {
    if (empty(s)) return '';
    const t = String(s).trim();
    const m = t.match(/^(\d{1,2}):?(\d{2})(?::\d{2})?$/);
    if (m) return String(m[1]).padStart(2, '0') + ':' + m[2];
    if (/^\d{3,4}$/.test(t)) {
      const p = t.padStart(4, '0');
      return p.slice(0, 2) + ':' + p.slice(2);
    }
    return t;
  }

  function dateTime(dateRaw, timeRaw, already) {
    if (!empty(already)) {
      const t = String(already).trim();
      if (/\d{4}-\d{2}-\d{2}/.test(t) && /\d{1,2}:\d{2}/.test(t)) return t.replace('T', ' ').slice(0, 16);
    }
    const d = fmtDateYmd(dateRaw);
    const tm = fmtTime(timeRaw);
    if (d && tm) return d + ' ' + tm;
    return d || tm || '';
  }

  function duration(raw) {
    if (empty(raw)) return '';
    const t = String(raw).trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return t.slice(0, 5);
    if (/^\d{3,4}$/.test(t)) {
      const p = t.padStart(4, '0');
      return p.slice(0, 2) + ':' + p.slice(2);
    }
    const n = num(t);
    if (n == null) return t;
    // Rå RESTID är ofta minuter (11 → 00:11). Över 3 h utan kolon antas minuter.
    if (n >= 0 && n < 600 && String(t).indexOf(':') < 0 && String(t).indexOf('.') < 0) {
      const m = Math.round(n);
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }
    return t;
  }

  function km(raw) {
    if (empty(raw)) return '';
    const n = num(raw);
    if (n == null) return String(raw).trim().replace('.', ',');
    // Public import dividerar rå-tiondelar med 10. Om talet ser ut som tiondelar
    // och vi redan har ett formatterat värde från trip, används det i stället.
    const s = (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
    return s;
  }

  function kmPrefer(tripKm, rawKm) {
    const a = km(tripKm);
    if (a) return a;
    const n = num(rawKm);
    if (n == null) return '';
    // Rå KILOMETER är ofta tiondelar (54 → 5,4).
    if (Number.isInteger(n) && n >= 10) return km(n / 10);
    return km(n);
  }

  function bagsOf(d) {
    return [d.trip, d.raw, d.detail, d.list, d.car].filter(Boolean);
  }

  function model(d) {
    const b = bagsOf(d);
    const kvittonr = pick(b, ['kvittonr', 'kvitto']) || d.kvittonr || '';
    const typKod = pick(b, ['kredittyp']);
    const typNamn = PAY[typKod] || pick(b, ['kredittypnamn', 'betalsatt', 'betalning', 'typnamn']);
    const typRad = typNamn ? (typKod && typNamn !== typKod ? typNamn + '  ' + typKod : typNamn) : (typKod || '');

    const taxi = pick(b, ['taxi', 'taxinr', 'taxinummer', 'bilnummer']);
    const regnr = pick(b, ['regnr', 'regn', 'registreringsnummer']);
    const forar = pick(b, ['forar', 'forare', 'forar_id']) || d.forar || '';

    const bolag = pick(b, ['bolag', 'akeri', 'företag', 'foretag', 'orgnamn', 'bolagsnamn', 'company']);
    const adress = pick(b, ['bolagsadress', 'foretagsadress', 'akeriadress', 'besoksadress']);
    const post = pick(b, ['bolagspost', 'postadress', 'postort']);
    const orgnr = pick(b, ['orgnr', 'org.nr', 'organisationsnummer']);

    const startzon = pick(b, ['startzon']);
    const slutzon = pick(b, ['slutzon']);
    const booknr = pick(b, ['booknr', 'boknr', 'bokn.nr', 'bokningsnr', 'bokning']);

    const start = dateTime(
      pick(b, ['dat_start', 'startdatum', 'datumstart']),
      pick(b, ['tid_start', 'starttid', 'tidstart']),
      pick(b, ['start', 'startts', 'started'])
    );
    const startDate = fmtDateYmd(pick(b, ['dat_start', 'startdatum', 'datumstart'])) || fmtDateYmd(d.startdatum);
    let slut = dateTime(
      pick(b, ['dat_slut', 'slutdatum']) || startDate,
      pick(b, ['tid_slut', 'sluttid', 'tidslut']),
      pick(b, ['slut', 'slutts', 'ended'])
    );
    const tid = duration(pick(b, ['restid', 'tidsatgang', 'tidsåtgång', 'duration']));
    const dist = kmPrefer(pick([d.trip, d.detail, d.list].filter(Boolean), ['kilometer', 'km', 'korstracka', 'körsträcka']), pick([d.raw].filter(Boolean), ['kilometer', 'km']));

    const startavgift = num(pick(b, ['startavgift', 'startavg', 'grundavgift']));
    const taxaNamn = pick(b, ['taxanamn', 'taxa', 'ordinarie']);
    const kmdeb = pick(b, ['kmdeb', 'km', 'kilometerdeb']);
    const tideb = pick(b, ['tideb', 'tiddeb', 'minutdeb']);
    const taxabelopp = num(pick(b, ['taxabelopp', 'taxakronor', 'ordinariekr', 'kr']));
    const adm = num(pick(b, ['admavgift', 'adm', 'administrationsavgift']));
    const egen = num(pick(b, ['egenavgift']));
    const palagg = num(pick(b, ['palagg', 'pålägg']));
    const extra = num(pick(b, ['extra']));

    const tx = num(pick(b, ['taxameterbelopp', 'txpris', 'tx.pris']));
    const summa = num(pick(b, ['belopp', 'debiteras', 'summa', 'attbetala'])) ?? tx;
    const eur = num(pick(b, ['eur', 'euro', 'beloppeur', 'summaeur']));
    const momsTyp = pick(b, ['momstyp', 'momssats', 'momsprocent']);
    let momsProc = null;
    if (!empty(momsTyp)) {
      const m = String(momsTyp).replace(',', '.').match(/(\d+(?:\.\d+)?)/);
      if (m) {
        const x = parseFloat(m[1]);
        if (x === 1 || x === 6) momsProc = 6;
        else if (x === 2 || x === 12) momsProc = 12;
        else if (x === 3 || x === 25) momsProc = 25;
        else if (x === 0) momsProc = 0;
        else if (x > 3 && x <= 25) momsProc = x;
      }
    }
    let moms = num(pick(b, ['moms', 'momsbelopp', 'vat']));
    let netto = num(pick(b, ['netto', 'nettobelopp']));
    if (summa != null && momsProc != null && moms == null) {
      netto = Math.round((summa / (1 + momsProc / 100)) * 100) / 100;
      moms = Math.round((summa - netto) * 100) / 100;
    }
    const taxeversion = pick(b, ['taxeversion', 'tabell', 'taxaversion']);
    const versionsnr = pick(b, ['versionsnr', 'version']);
    const underskriftDatum = fmtDateYmd(pick(b, ['dat_slut', 'slutdatum', 'startdatum'])) || d.startdatum || '';

    return {
      kvittonr, typRad, typKod,
      taxi, regnr, forar,
      bolag, adress, post, orgnr,
      booknr, startzon, slutzon, start, slut, tid, dist,
      startavgift, taxaNamn, kmdeb, tideb, taxabelopp, adm, egen, palagg, extra,
      tx, summa, eur, momsProc, moms, netto, taxeversion, versionsnr, underskriftDatum
    };
  }

  function row(label, value, cls) {
    if (empty(value)) return '';
    return '<div class="kv-row' + (cls ? ' ' + cls : '') + '"><span class="kv-k">' + esc(label) + '</span><span class="kv-v">' + esc(value) + '</span></div>';
  }

  function head(title) {
    return '<div class="kv-h">' + esc(title) + '</div>';
  }

  function dots() {
    return '<div class="kv-dots" aria-hidden="true"></div>';
  }

  function fareRow(left, mid, right, krVal) {
    if (empty(left) && empty(mid) && empty(right) && krVal == null) return '';
    return '<div class="kv-fare">' +
      '<span class="kv-fare-l">' + esc(left || '') + '</span>' +
      '<span class="kv-fare-m">' + esc(mid || '') + '</span>' +
      '<span class="kv-fare-r">' + esc(right || '') + '</span>' +
      '<span class="kv-fare-kr">' + (krVal != null ? esc(kr(krVal)) : '') + '</span>' +
      '</div>';
  }

  function renderPaper(m) {
    const company = [m.bolag, m.adress, m.post, m.orgnr ? 'ORG.NR ' + m.orgnr : '']
      .filter(s => !empty(s))
      .map(s => '<div>' + esc(s) + '</div>')
      .join('');

    const taxiBlock = [
      row('TAXINUMMER:', m.taxi),
      row('REGNR:', m.regnr),
      row('FÖRARE:', m.forar)
    ].join('');

    const resaBlock = [
      row('BOKN.NR:', m.booknr),
      row('STARTZON:', m.startzon),
      row('SLUTZON:', m.slutzon),
      row('START:', m.start),
      row('SLUT:', m.slut),
      row('TIDSÅTGÅNG:', m.tid),
      row('KÖRSTRÄCKA:', m.dist ? m.dist + ' km' : '')
    ].join('');

    // Taxa-raden: namn + ev. km/tid + kr. Visa bara kända delar, hitta inte på priser.
    let taxaMid = '';
    const kmShown = !empty(m.kmdeb) ? String(m.kmdeb).replace('.', ',') : '';
    const tidShown = !empty(m.tideb) ? String(m.tideb).replace('.', ',') : '';
    taxaMid = [kmShown, tidShown].filter(Boolean).join('   ');

    const fareBits = [
      fareRow(m.startavgift != null ? 'STARTAVGIFT' : '', '', '', m.startavgift),
      fareRow(m.taxaNamn || ((kmShown || tidShown || m.taxabelopp != null) ? 'TAXA' : ''), taxaMid, '', m.taxabelopp),
      fareRow(m.adm != null ? 'ADM AVGIFT' : '', '', '', m.adm),
      fareRow(m.egen != null ? 'EGEN AVGIFT' : '', '', '', m.egen),
      fareRow(m.palagg != null ? 'PÅLÄGG' : '', '', '', m.palagg),
      fareRow(m.extra != null ? 'EXTRA' : '', '', '', m.extra)
    ].join('');

    const txLine = m.tx != null ? row('TX. PRIS', kr(m.tx), 'kv-tx') : (m.summa != null ? row('TX. PRIS', kr(m.summa), 'kv-tx') : '');
    const sumLine = m.summa != null
      ? '<div class="kv-sum"><span>SUMMA</span><span>' + esc(kr(m.summa)) + '</span></div>'
      : '';
    const eurLine = m.eur != null ? '<div class="kv-eur">(' + esc(kr(m.eur)) + ' EUR)</div>' : '';

    let momsBlock = '';
    if (m.momsProc != null && (m.moms != null || m.netto != null)) {
      momsBlock = '<div class="kv-moms"><div class="kv-moms-h">' +
        '<span>MOMS %</span><span>NETTO</span><span>MOMS</span></div>' +
        '<div class="kv-moms-r">' +
        '<span>' + esc(String(m.momsProc).replace('.', ',')) + '</span>' +
        '<span>' + esc(m.netto != null ? kr(m.netto) : '') + '</span>' +
        '<span>' + esc(m.moms != null ? kr(m.moms) : '') + '</span></div></div>';
    }

    const ver = (m.taxeversion ? row('TAXEVERSION:', m.taxeversion) : '') +
      (m.versionsnr ? row('VERSIONSNR:', m.versionsnr) : '');

    const signDate = m.underskriftDatum ? '<div class="kv-sign-date">' + esc(m.underskriftDatum) + '</div>' : '';
    const signName = m.bolag ? '<div class="kv-sign-name">' + esc(m.bolag) + '</div>' : '';

    return (
      '<div class="kv-paper" role="document" aria-label="Kvittokopia">' +
        '<div class="kv-brand">' +
          '<img class="kv-logo" src="img/taxi-goteborg-logo.png" alt="Taxi Göteborg" width="108" height="126">' +
          '<div class="kv-phone">650 000</div>' +
        '</div>' +
        head('KVITTOKOPIA') +
        (m.kvittonr ? '<div class="kv-nr">NR: ' + esc(m.kvittonr) + '</div>' : '') +
        (typRad(m) ? '<div class="kv-pay"><span>' + esc(typNamnPart(m)) + '</span><span>' + esc(m.typKod && typNamnPart(m) !== m.typKod ? m.typKod : '') + '</span></div>' : '') +
        (taxiBlock ? (head('TAXIINFORMATION') + taxiBlock) : '') +
        (company ? '<div class="kv-co">' + company + '</div>' : '') +
        (resaBlock ? (head('RESEINFORMATION') + resaBlock) : '') +
        (fareBits ? (dots() + fareBits) : '') +
        (txLine || sumLine ? (dots() + head('BETALINFORMATION') + txLine + sumLine + eurLine) : '') +
        (momsBlock || ver ? (dots() + momsBlock + ver) : '') +
        '<div class="kv-sign">' +
          '<div class="kv-sign-brand">Taxi Göteborg</div>' +
          '<div class="kv-sign-box"><span>Underskrift</span></div>' +
          signName + signDate +
        '</div>' +
      '</div>'
    );
  }

  function typNamnPart(m) {
    if (!m.typRad) return '';
    if (m.typKod && m.typRad.endsWith('  ' + m.typKod)) return m.typRad.slice(0, m.typRad.length - (2 + m.typKod.length));
    return m.typRad;
  }

  function typRad(m) { return m.typRad; }

  function overlay() {
    let el = document.getElementById('kv-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'kv-overlay';
    el.className = 'kv-overlay';
    el.setAttribute('hidden', '');
    el.innerHTML =
      '<div class="kv-dialog" role="dialog" aria-modal="true" aria-labelledby="kv-dialog-title">' +
        '<h2 id="kv-dialog-title" class="kv-visually-hidden">Kvittokopia</h2>' +
        '<div class="kv-scroll"><div class="kv-body"></div></div>' +
        '<div class="kv-actions"><button type="button" class="kv-close">Stäng</button></div>' +
      '</div>';
    el.addEventListener('click', function (e) {
      if (e.target === el) close();
    });
    el.querySelector('.kv-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.hasAttribute('hidden')) close();
    });
    document.body.appendChild(el);
    return el;
  }

  function setBody(html) {
    overlay().querySelector('.kv-body').innerHTML = html;
  }

  async function rpcCall(kvittonr, startdatum, forar) {
    const args = { p_kvittonr: kvittonr, p_startdatum: startdatum || null, p_forar: forar || null };
    if (typeof tripRpc === 'function') return tripRpc('get_trip_receipt', args);
    if (typeof rpc === 'function') return rpc('get_trip_receipt', args);
    throw new Error('rpc missing');
  }

  async function open(kvittonr, forar, startdatum) {
    const el = overlay();
    el.removeAttribute('hidden');
    document.body.classList.add('kv-open');
    setBody('<div class="kv-paper kv-loading">Hämtar kvittokopia…</div>');
    try {
      const data = await rpcCall(kvittonr, startdatum, forar);
      if (!data || data.ok === false) {
        setBody('<div class="kv-paper kv-err">Kunde inte hämta kvittot.</div>');
        return;
      }
      setBody(renderPaper(model(data)));
    } catch (err) {
      setBody('<div class="kv-paper kv-err">Kunde inte hämta kvittot.</div>');
    }
  }

  function openFromRow(row, ev) {
    if (ev) ev.stopPropagation();
    if (!row) return;
    open(row.getAttribute('data-kvittonr') || '', row.getAttribute('data-forar') || '', row.getAttribute('data-startdatum') || '');
  }

  function close() {
    const el = document.getElementById('kv-overlay');
    if (el) el.setAttribute('hidden', '');
    document.body.classList.remove('kv-open');
  }

  window.KVITTO = { open, openFromRow, close, model, renderPaper };
})();
