'use strict';
const assert = require('node:assert/strict');
const { boot } = require('../lazy-views/dom.cjs');

function trains() {
  const base = Date.parse('2026-11-11T20:00:00+01:00');
  const out = [];
  for (let i = 0; i < 40; i++) {
    const sched = new Date(base + i * 10 * 60000).toISOString();
    out.push({ id: String(1000 + i), dir: 'ANK', sched, other: 'Stockholm C', from: ['Stockholm C'] });
  }
  return out;
}

(async () => {
  const a = await boot();
  const w = a.w, original = w.fetch;
  const list = trains();
  w.fetch = async (url, opts) => {
    if (String(url).includes('/api/trains') && !String(url).includes('delta=')) {
      return { ok: true, status: 200, json: async () => ({ station: 'Göteborg C', stationSignature: 'G', updated: '2026-11-11T20:00:00.000Z', trains: list }) };
    }
    return original(url, opts);
  };
  await w.openItem('ankomster');
  await new Promise((r) => setTimeout(r, 80));
  const host = w.document.querySelector('.ank');
  assert(host, 'ank host');
  const rows = [...host.querySelectorAll('[data-ank-key]')];
  assert(rows.length > 10, 'enough rows: ' + rows.length);

  const headerH = 60, toolbar = 120, rowH = 48, viewH = 600;
  let y = 0;
  const header = w.document.querySelector('header') || w.document.createElement('header');
  if (!header.isConnected) w.document.body.insertBefore(header, w.document.body.firstChild);

  function rect(top, h) {
    return { top: top, bottom: top + h, left: 0, right: 1024, width: 1024, height: h, x: 0, y: top };
  }
  const proto = w.HTMLElement.prototype;
  const origRect = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function () {
    if (this.tagName === 'HEADER') return rect(0, headerH);
    if (this.hasAttribute && this.hasAttribute('data-ank-key') && host.contains(this)) {
      const rs = [...host.querySelectorAll('[data-ank-key]')];
      const i = rs.indexOf(this);
      if (i >= 0) return rect(headerH + toolbar - y + i * rowH, rowH);
    }
    return origRect ? origRect.call(this) : rect(0, 0);
  };

  const targetIndex = 12;
  y = toolbar + targetIndex * rowH - 8;
  Object.defineProperty(w, 'scrollY', { configurable: true, get: () => y, set: (v) => { y = v; } });
  Object.defineProperty(w, 'pageYOffset', { configurable: true, get: () => y });
  let jumpedToBottom = false;
  const contentH = toolbar + 40 * rowH;
  const maxScroll = Math.max(0, contentH + headerH - viewH);
  w.scrollTo = function (a, b) {
    const ny = (typeof a === 'object' && a) ? a.y : b;
    y = ny;
    if (Math.abs(y - maxScroll) < 2 && y > 100) jumpedToBottom = true;
  };
  w.scrollBy = function (a, b) {
    const dy = (typeof a === 'object' && a) ? a.y : b;
    y += dy;
    if (Math.abs(y - maxScroll) < 2 && y > 100) jumpedToBottom = true;
  };

  const key = rows[targetIndex].getAttribute('data-ank-key');
  const topBefore = rows[targetIndex].getBoundingClientRect().top;
  const yBefore = y;

  w.ANKOMSTER.repaint();
  await new Promise((r) => setTimeout(r, 40));

  const neo = [...host.querySelectorAll('[data-ank-key]')].find((r) => r.getAttribute('data-ank-key') === key);
  assert(neo, 'row still present after repaint');
  const topAfter = neo.getBoundingClientRect().top;
  assert.equal(jumpedToBottom, false, 'must not jump to the bottom (y=' + y + ', max=' + maxScroll + ')');
  assert.ok(Math.abs(topAfter - topBefore) < 2, 'same row stays put: before=' + topBefore + ' after=' + topAfter + ' y=' + y + ' was=' + yBefore);
  w.ANKOMSTER.stop();
  a.dom.window.close();
  console.log('PASS ankomster scroll stays put across repaint (row ' + targetIndex + ')');
})().catch((e) => { console.error(e); process.exitCode = 1; });
