/* TaxiData service worker: webbnotiser (push) för bevakade flyg/tåg och prognos.
 * Ingen cache av sidor eller data här (appen hämtar alltid färsk data).
 * Varje push sparas också i telefonen (IndexedDB 'taxidata-notis') så att notis.js kan lägga in den i notisflödet
 * när appen öppnas – annars var notisen borta om man inte tryckte på den direkt.
 * Tryck på notisen öppnar det den gäller: Ankomster (flyg/tåg-fliken) eller Prognos (rätt zon) (t551u).
 * Ångra: ta bort filen och avregistrera i bevakning.js (se UNDO-flygbevakning-2026-10-25.md). */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

// ---------- spara push i telefonen (läses av notis.js) ----------
// Samma nyckel räknas fram i notis.js (NOTIS.keyOf) så att en notis bara sparas en gång.
function p2(n) { return (n < 10 ? '0' : '') + n; }
function notisKey(d, now) {
  if (d.nkey) return String(d.nkey);   // servern skickar med nyckeln den sparade notisen under
  var tag = String(d.tag || 'push'), t = new Date(now);
  var ymd = t.getFullYear() + p2(t.getMonth() + 1) + p2(t.getDate());
  if (tag.indexOf('prognos') === 0) {
    var m = /ca (\d\d):(\d\d)/.exec(d.body || '');
    if (m) return 'prognos|' + tag + '@' + m[1] + m[2] + '|' + ymd;
  }
  return tag + '|' + (d.ts || now);
}
// Vart notisen leder (t551u). Servern skickar target för Prognos; äldre push: zon/kategori ur taggen
// (prognos-161-app) och tiden ur texten ("ca 14:35"). Samma regler som notis.js NOTIS.targetOf.
function notisTarget(d) {
  if (d.target && typeof d.target === 'object') return d.target;
  var m = /^prognos-(\d{1,5})-([a-z_]{1,20})$/.exec(String(d.tag || ''));
  return m ? { zone: m[1], cat: m[2] } : null;
}
function notisUrl(d, tg) {
  var tag = String(d.tag || ''), u = new URL(d.url || './', self.registration.scope);
  if (tag.indexOf('flyg') === 0 || tag.indexOf('tag') === 0) {
    u.searchParams.set('sida', 'ankomster');
    if (!u.searchParams.get('flik')) u.searchParams.set('flik', tag.indexOf('flyg') === 0 ? 'flyg' : 'tag');
  } else if (tag.indexOf('prognos') === 0) {
    u.searchParams.set('sida', 'prognos');
    if (tg && tg.zone && !u.searchParams.get('zon')) u.searchParams.set('zon', tg.zone);
    if (tg && tg.cat && !u.searchParams.get('kat')) u.searchParams.set('kat', tg.cat);
    if (tg && tg.at && !u.searchParams.get('tid')) u.searchParams.set('tid', tg.at);
    if (tg && tg.id && !u.searchParams.get('bok')) u.searchParams.set('bok', tg.id);
  }
  return u.href;
}
function notisSave(item) {
  return new Promise(function (res) {
    try {
      var rq = indexedDB.open('taxidata-notis', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('q', { keyPath: 'key' }); };
      rq.onerror = function () { res(); };
      rq.onsuccess = function () {
        try {
          var tx = rq.result.transaction('q', 'readwrite');
          tx.objectStore('q').put(item);
          tx.oncomplete = tx.onerror = tx.onabort = function () { rq.result.close(); res(); };
        } catch (x) { res(); }
      };
    } catch (x) { res(); }
  });
}

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'TaxiData', body: e.data ? e.data.text() : '' }; }
  var title = d.title || 'TaxiData';
  var opts = {
    body: d.body || '',
    tag: d.tag || 'bevakning',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 300],
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: null
  };
  var now = Date.now(), key = notisKey(d, now), tg = notisTarget(d);
  opts.data = { url: notisUrl(d, tg), key: key, tag: d.tag || '', target: tg };
  var item = { key: key, tag: d.tag || '', title: title, body: d.body || '', url: d.url || '', at: now, target: tg };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    notisSave(item),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      cs.forEach(function (c) { c.postMessage({ type: 'bev-push', msg: d, key: key, at: now }); });
    })
  ]));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var nd = e.notification.data || {};
  var url = new URL(nd.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) {
        // Appen är redan öppen: notis.js öppnar samma ställe som i notisflödet (och markerar notisen läst)
        cs[i].postMessage({ type: 'bev-open', tag: nd.tag || e.notification.tag || '', key: nd.key || '', target: nd.target || null,
          title: e.notification.title || '', body: e.notification.body || '' });
        return cs[i].focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
