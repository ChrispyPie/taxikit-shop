/* Listan ska inte visa globalt nätfel när ett valfritt delanrop faller, och
   ska behålla redan hämtade ärenden om case_admin_list faller. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('TaxiData/mailbox-ui.js', 'utf8');

function make(fail) {
  const cases = [{ kind: 'issue', id: 1, st: 'ny', title: 'Felanmälan', at: '2026-11-12T21:38:00Z' }];
  const threads = [{ id: 10, subject: 'Meddelande', booking_states: [], last_sender_role: 'driver', at: '2026-11-12T20:00:00Z' }];
  const calls = [];
  const c = { console, Intl, Date, Promise, history: { pushState() {} }, document: { createElement() { return {}; }, head: { appendChild() {} } }, window: null };
  c.window = c;
  c.ARENDE = {
    esc: (x) => String(x ?? ''),
    WORDS: {},
    errText: (e) => e && e.message === 'cannot execute UPDATE in a read-only transaction' ? 'Det gick inte. Kontrollera nätet och försök igen.' : (e && e.message) || 'err',
    rpc: async (name, p) => {
      calls.push([name, p && p.p_action]);
      if (fail.rpc && fail.rpc(name, p, calls.length)) {
        const e = new Error(fail.message || 'nope');
        if (fail.code) e.code = fail.code;
        throw e;
      }
      if (name === 'mailbox_v2') {
        switch (p.p_action) {
          case 'list': return threads;
          case 'mailbox_capabilities': return { can_trash: true };
          case 'item_flags': return [];
        }
        return [];
      }
      if (name === 'issue_booking') return [];
      return { items: cases };
    }
  };
  vm.createContext(c);
  vm.runInContext(source, c);
  const u = c.MAILBOX.create(true, 'UI');
  const host = { isConnected: true, innerHTML: '', querySelector() { return null; } };
  return { u, host, calls, threads, cases };
}

(async () => {
  // Valfritt anrop (item_flags) faller: listan visas, inget fel.
  const a = make({ rpc: (name, p) => name === 'mailbox_v2' && p.p_action === 'item_flags' });
  a.u.render(a.host);
  await a.u.refresh();
  assert(!a.host.innerHTML.includes('Det gick inte'));
  assert(!a.host.innerHTML.includes('nope'));
  assert(a.host.innerHTML.includes('Felanmälan'));
  assert(a.host.innerHTML.includes('Meddelande'));

  // issue_booking links faller: samma sak (redan valfritt).
  const b = make({ rpc: (name) => name === 'issue_booking' });
  b.u.render(b.host);
  await b.u.refresh();
  assert(!b.host.innerHTML.includes('Det gick inte'));
  assert(b.host.innerHTML.includes('Felanmälan'));

  // case_admin_list faller efter lyckad första laddning: felet visas, men tidigare ärenden och nya trådar är kvar.
  const c = make({ rpc: () => false });
  c.u.render(c.host);
  await c.u.refresh();
  assert(c.host.innerHTML.includes('Felanmälan'));
  const c2 = make({
    rpc: (name) => name === 'case_admin_list',
    message: 'cannot execute UPDATE in a read-only transaction',
    code: '25006'
  });
  // återanvänd samma testhjälp men fail redan från start, med förifylld lista via en första lyckad omgång
  // Gör om: först lycka, sedan fail på samma instans.
  let failList = false;
  const d = make({
    rpc: (name) => failList && name === 'case_admin_list',
    message: 'cannot execute UPDATE in a read-only transaction',
    code: '25006'
  });
  d.u.render(d.host);
  await d.u.refresh();
  assert(d.host.innerHTML.includes('Felanmälan'));
  assert(!d.host.innerHTML.includes('Det gick inte'));
  failList = true;
  await d.u.refresh(true);
  assert(d.host.innerHTML.includes('Det gick inte. Kontrollera nätet och försök igen.'));
  assert(d.host.innerHTML.includes('Felanmälan'), 'tidigare ärenden ska ligga kvar');
  assert(d.host.innerHTML.includes('Meddelande'), 'trådar från lyckat mailbox-anrop ska uppdateras');

  console.log('PASS optional RPC failure is silent; case list failure keeps previous items and shows error');
})().catch((e) => { console.error(e); process.exit(1); });
