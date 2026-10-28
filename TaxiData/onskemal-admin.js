/* Admin › Önskemål och idéer.
 * Ägaren (och S admin) skriver vad som ska ändras eller läggas till i appen. Christian (och assistenten)
 * läser det via databasen och pratar igenom det innan något byggs. Inget ändras automatiskt.
 * Status (Ny / Läst / Planerad / Klar / Inte nu) och svar sätts av Christian, här visas de bara.
 * Ägaren kan ta bort sitt eget önskemål så länge det har status Ny.
 * Server: dev_wish_list, dev_wish_add, dev_wish_delete (tabell dev_wishes). Behörighet och åkeri kontrolleras där.
 * Använder admin.html:s rpc(), esc() och errText().
 * Ångra: se /workspace/backups/UNDO-onskemal-2026-10-28.md
 */
(function () {
  'use strict';
  var STATUS = { ny: 'Ny', last: 'Läst', planerad: 'Planerad', klar: 'Klar', inte_nu: 'Inte nu' };
  var MAX = 2000;
  var ERR = {
    need_text: 'Skriv något först.',
    too_long: 'Texten är för lång (högst 2000 tecken).',
    rate_limited: 'Du har skickat många önskemål i dag. Försök igen i morgon.',
    not_found: 'Önskemålet finns inte längre.',
    not_editable: 'Christian har redan tittat på det här, så det går inte att ta bort längre.',
    forbidden: 'Du har inte behörighet att göra det.',
    demo_read_only: 'Det här är ett demokonto. Du kan titta runt men inte ändra något.'
  };
  var O = window.ONSKEMAL_ADMIN = { list: null, err: '', busy: false, draft: '', msg: '' };

  (function css() {
    var s = document.createElement('style');
    s.textContent =
      '.onk-info{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px;font-size:calc(14px * var(--font-scale, 1));line-height:1.45}' +
      '.onk-info b{display:block;font-size:calc(16px * var(--font-scale, 1));margin-bottom:4px}' +
      '.onk-form{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.onk-form textarea{width:100%;box-sizing:border-box;min-height:110px;padding:10px;border:1px solid var(--c-cbd5e0);border-radius:8px;font:inherit;font-size:calc(15px * var(--font-scale, 1));resize:vertical}' +
      '.onk-row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}' +
      '.onk-row small{color:var(--c-718096);font-size:calc(12px * var(--font-scale, 1))}' +
      '.onk-row button{padding:10px 22px;font-size:calc(15px * var(--font-scale, 1))}' +
      '.onk-row button.onk-go{background:var(--primary);color:var(--on-primary,#fff);font-weight:600}.onk-row button.onk-go:disabled{opacity:.6}' +
      '.onk-msg{font-size:calc(13px * var(--font-scale, 1));margin-top:8px;padding:6px 8px;border-radius:6px}' +
      '.onk-msg.ok{background:var(--c-c6f6d5);color:var(--c-276749)}.onk-msg.err{background:var(--c-fed7d7);color:var(--c-c53030)}' +
      '.onk-h{font-size:calc(12px * var(--font-scale, 1));font-weight:600;color:var(--c-718096);margin:16px 0 6px;text-transform:uppercase}' +
      '.onk-card{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.onk-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;font-size:calc(13px * var(--font-scale, 1));color:var(--c-4a5568)}' +
      '.onk-txt{margin-top:6px;font-size:calc(14px * var(--font-scale, 1));white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.onk-chip{font-size:calc(11px * var(--font-scale, 1));padding:2px 8px;border-radius:10px;white-space:nowrap;font-weight:600}' +
      '.onk-chip.ny{background:var(--c-fefcbf);color:var(--c-975a16)}.onk-chip.last{background:var(--c-edf2f7);color:var(--c-4a5568)}' +
      '.onk-chip.planerad{background:var(--c-bee3f8,#bee3f8);color:var(--c-2c5282,#2c5282)}.onk-chip.klar{background:var(--c-c6f6d5);color:var(--c-276749)}' +
      '.onk-chip.inte_nu{background:var(--c-fed7d7);color:var(--c-c53030)}' +
      '.onk-rep{margin-top:8px;font-size:calc(13px * var(--font-scale, 1));background:var(--c-f7fafc);border-radius:8px;padding:6px 8px;white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.onk-rep .w{display:block;font-size:calc(11px * var(--font-scale, 1));color:var(--c-718096);margin-bottom:2px}' +
      '.onk-del{margin-top:8px;padding:6px 12px;font-size:calc(13px * var(--font-scale, 1));border-color:var(--c-c53030)!important;color:var(--c-c53030)!important}' +
      '.onk-empty{text-align:center;color:var(--c-718096);font-size:calc(14px * var(--font-scale, 1));padding:16px}';
    document.head.appendChild(s);
  })();

  function E(e) { return ERR[e && e.message] || (typeof errText === 'function' ? errText(e) : 'Något gick fel.'); }
  function when(t) {
    return new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function isDemo() { return !!(window.DEMO && DEMO.owner && DEMO.owner()); }
  function demoList() {
    var d = function (n, h) { var x = new Date(); x.setDate(x.getDate() - n); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    return [
      { id: -1, body: 'Kan vi få se statistik per bil i Åkeridata? (exempel)', status: 'planerad', reply: 'Bra idé! Vi bygger det nästa vecka. (exempel)', created_at: d(2, 10), mine: true, author: 'Exempel Ä' },
      { id: -2, body: 'Påminnelse när det är dags för däckbyte. (exempel)', status: 'ny', reply: null, created_at: d(0, 9), mine: true, author: 'Exempel Ä' }];
  }

  function rr() { if (typeof render === 'function') render(); else O.render(); }   // admin.html:s render() sätter rubrik och brödsmulor

  O.load = async function () {
    O.list = null; O.err = ''; O.msg = '';
    rr();
    try { O.list = isDemo() ? demoList() : (await rpc('dev_wish_list')) || []; }
    catch (e) { O.err = E(e); O.list = []; }
    rr();
  };

  O.render = function (content) {
    var el = content || document.getElementById('content');
    if (!el || !(path[0] && path[0].id === 'onskemal')) return;
    var h = '<div class="onk-info"><b>💡 Önskemål och idéer</b>' +
      'Skriv här vad du vill ändra eller lägga till i appen. Christian går igenom allt innan något ändras. ' +
      'Inget i appen ändras automatiskt när du skickar.</div>';
    h += '<div class="onk-form"><textarea id="onk-text" maxlength="' + MAX + '" placeholder="Till exempel: Jag vill kunna se hur mycket varje bil har kört i månaden.">' + esc(O.draft) + '</textarea>' +
      '<div class="onk-row"><small id="onk-count">' + O.draft.length + ' / ' + MAX + '</small>' +
      '<button id="onk-send" class="onk-go" onclick="ONSKEMAL_ADMIN.send()"' + (O.busy ? ' disabled' : '') + '>' + (O.busy ? 'Skickar…' : 'Skicka') + '</button></div>' +
      (O.msg ? '<div class="onk-msg ok">' + esc(O.msg) + '</div>' : '') +
      (O.err ? '<div class="onk-msg err">' + esc(O.err) + '</div>' : '') + '</div>';
    h += '<div class="onk-h">Tidigare önskemål</div>';
    if (O.list === null) h += '<div class="onk-empty">Laddar…</div>';
    else if (!O.list.length) h += '<div class="onk-empty">Inga önskemål än.</div>';
    else O.list.forEach(function (w) {
      var st = STATUS[w.status] ? w.status : 'ny';
      h += '<div class="onk-card" data-id="' + w.id + '"><div class="onk-top"><span>' + esc(when(w.created_at)) +
        (w.author && !w.mine ? ' · ' + esc(w.author) : '') + '</span><span class="onk-chip ' + st + '">' + STATUS[st] + '</span></div>' +
        '<div class="onk-txt">' + esc(w.body) + '</div>' +
        (w.reply ? '<div class="onk-rep"><span class="w">Svar från Christian</span>' + esc(w.reply) + '</div>' : '') +
        (w.mine && st === 'ny' ? '<button class="onk-del" onclick="ONSKEMAL_ADMIN.del(' + w.id + ')">Ta bort</button>' : '') + '</div>';
    });
    el.innerHTML = h;
    var ta = document.getElementById('onk-text');
    ta.addEventListener('input', function () { O.draft = ta.value; document.getElementById('onk-count').textContent = ta.value.length + ' / ' + MAX; });
  };

  O.send = async function () {
    if (O.busy) return;
    var v = (O.draft || '').trim();
    O.msg = ''; O.err = '';
    if (!v) { O.err = ERR.need_text; rr(); return; }
    O.busy = true; rr();
    try {
      if (isDemo()) { var e = new Error('demo_read_only'); throw e; }
      var w = await rpc('dev_wish_add', { p_body: v });
      (O.list = O.list || []).unshift(w);
      O.draft = '';
      O.msg = 'Tack! Skickat. Christian läser det och hör av sig innan något ändras.';
    } catch (e) { O.err = E(e); }
    O.busy = false; rr();
  };

  O.del = async function (id) {
    if (!confirm('Ta bort önskemålet?')) return;
    O.msg = ''; O.err = '';
    try {
      if (isDemo()) throw new Error('demo_read_only');
      await rpc('dev_wish_delete', { p_id: id });
      O.list = (O.list || []).filter(function (w) { return w.id !== id; });
      O.msg = 'Borttaget.';
    } catch (e) { O.err = E(e); }
    rr();
  };
})();
