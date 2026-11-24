/* TaxiData service worker:
 * 1) Lokal cache av statiska appfiler (JS, CSS, bilder, ljud) under versionsnamnet CACHE_NAME.
 *    Cachar ALDRIG Supabase/API-anrop, meddelanden, ärenden eller HTML över nätet (HTML kör network-first).
 *    Vid ny version rensas gamla cachar automatiskt och öppna flikar får besked ('sw-updated').
 * 2) Webbnotiser (push) för bevakade flyg/tåg/båtar och prognos (sparas i IndexedDB 'taxidata-notis').
 * Ångra: återställ föregående sw.js via backup-branch eller ta bort fetch-lyssnaren. */
var CACHE_VER = '20261124avm1';
var CACHE_PREFIX = 'taxidata-static-';
var CACHE_NAME = CACHE_PREFIX + CACHE_VER;

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((function () {
    var clearedOld = false;
    var p = (typeof caches !== 'undefined')
      ? caches.keys().then(function (keys) {
          var old = keys.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME; });
          clearedOld = old.length > 0;
          return Promise.all(old.map(function (k) { return caches.delete(k); }));
        })
      : Promise.resolve();
    return p.then(function () { return self.clients.claim(); }).then(function () {
      if (!clearedOld) return;
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
        cs.forEach(function (c) {
          try { c.postMessage({ type: 'sw-updated', version: CACHE_VER }); } catch (err) {}
        });
      });
    });
  })());
});

var STATIC_RE = /\.(?:js|css|png|jpe?g|webp|svg|ico|mp3|wav|woff2?|webmanifest)$/i;
function isHtmlReq(req, rel) {
  if (req.mode === 'navigate') return true;
  if (rel === '' || rel.charAt(rel.length - 1) === '/' || /\.html?$/i.test(rel)) return true;
  return false;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (!req || req.method !== 'GET' || typeof caches === 'undefined') return;
  var url, scopeUrl;
  try {
    url = new URL(req.url);
    scopeUrl = new URL(self.registration.scope);
  } catch (err) { return; }
  if (url.origin !== scopeUrl.origin) return;
  if (url.pathname.indexOf(scopeUrl.pathname) !== 0) return;
  var rel = url.pathname.slice(scopeUrl.pathname.length);
  if (rel === 'sw.js') return;
  if (url.pathname.indexOf('/rest/v1/') >= 0 || url.pathname.indexOf('/functions/v1/') >= 0 || url.pathname.indexOf('/api/') >= 0) return;

  if (isHtmlReq(req, rel)) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.open(CACHE_NAME).then(function (c) { return c.match(req); });
      })
    );
    return;
  }

  if (!STATIC_RE.test(url.pathname)) return;
  e.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') {
            cache.put(req, res.clone()).catch(function () {});
          }
          return res;
        });
      });
    })
  );
});

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
  if (tag.indexOf('flyg') === 0 || tag.indexOf('tag') === 0 || tag.indexOf('bat') === 0) {
    u.searchParams.set('sida', 'ankomster');
    if (!u.searchParams.get('flik')) u.searchParams.set('flik', tag.indexOf('flyg') === 0 ? 'flyg' : (tag.indexOf('bat') === 0 ? 'bat' : 'tag'));
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
  // Villkor för tåg (12 nov): servern skickar silent när notisen inte ska låta. Äldre server (utan v):
  // "ny tid" för tåg med försening under 30 min blir tyst (samma standard som villkoren).
  var quiet = d.silent === true;
  if (!quiet && d.v !== 1 && String(d.tag || '').indexOf('tag') === 0 && /: ny tid /.test(title)) {
    var lm = /försenat (\d+) min/.exec(d.body || '');
    quiet = !lm || +lm[1] < 30;
  }
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
  // Chrome tillåter inte vibration på en tyst notis.
  if (quiet) { opts.silent = true; delete opts.vibrate; opts.renotify = false; }
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
