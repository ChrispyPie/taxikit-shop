/* A.rpc försöker om en gång vid PostgREST 25006 / HTTP 405 (read-only transaktion). */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function load(fetchImpl) {
  const src = fs.readFileSync('TaxiData/arende-status.js', 'utf8');
  const localStorage = { getItem() { return 'tok'; } };
  const document = { createElement() { return {}; }, documentElement: { appendChild() {} }, head: { appendChild() {} } };
  const c = {
    console, document, localStorage, fetch: fetchImpl,
    TRIP_API_URL: 'https://example.test', TRIP_API_KEY: 'key',
    window: null
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(src, c);
  return c.ARENDE;
}

function jsonRes(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

(async () => {
  // 405 + 25006 first, then 200 → one retry, success
  let n = 0;
  const A = load(async (url, opts) => {
    n++;
    assert.strictEqual(url, 'https://example.test/rest/v1/rpc/case_admin_list');
    const body = JSON.parse(opts.body);
    assert.strictEqual(body.p_token, 'tok');
    if (n === 1) return jsonRes(405, { code: '25006', message: 'cannot execute UPDATE in a read-only transaction' });
    return jsonRes(200, { items: [{ kind: 'issue', id: 1 }] });
  });
  assert.strictEqual(A.isReadOnlyTx({ code: '25006', message: 'cannot execute UPDATE in a read-only transaction' }), true);
  assert.strictEqual(A.isReadOnlyTx({ message: 'HTTP 405' }), true);
  assert.strictEqual(A.isReadOnlyTx({ message: 'forbidden' }), false);
  const d = await A.rpc('case_admin_list', { p_klar_limit: 5000 });
  assert.strictEqual(n, 2);
  assert.strictEqual(d.items[0].id, 1);

  // 405 twice → still throws after one retry, with code 25006
  let n2 = 0;
  const B = load(async () => {
    n2++;
    return jsonRes(405, { code: '25006', message: 'cannot execute UPDATE in a read-only transaction' });
  });
  await B.rpc('case_admin_list', {}).then(
    () => { throw new Error('should fail'); },
    (e) => { assert.strictEqual(e.code, '25006'); assert.strictEqual(n2, 2); }
  );

  // Other errors are not retried (e.g. forbidden)
  let n3 = 0;
  const C = load(async () => {
    n3++;
    return jsonRes(400, { code: '42501', message: 'forbidden' });
  });
  await C.rpc('case_admin_list', {}).then(
    () => { throw new Error('should fail'); },
    (e) => { assert.strictEqual(e.message, 'forbidden'); assert.strictEqual(n3, 1); }
  );

  console.log('PASS A.rpc retries once on 25006/405 and not on other errors');
})().catch((e) => { console.error(e); process.exit(1); });
