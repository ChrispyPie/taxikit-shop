/* TaxiData service worker: bara webbnotiser (push) för bevakade flyg och tåg.
 * Ingen cache av sidor eller data här (appen hämtar alltid färsk data).
 * Ångra: ta bort filen och avregistrera i bevakning.js (se UNDO-flygbevakning-2026-10-25.md). */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

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
    data: { url: d.url || './' }
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      cs.forEach(function (c) { c.postMessage({ type: 'bev-push', msg: d }); });
    })
  ]));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) {
        cs[i].postMessage({ type: 'bev-open' });
        return cs[i].focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
