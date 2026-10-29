/* Enhets-id för säkerhetsloggen.
 * Appen skapar ett slumpat id första gången och sparar det i telefonen (localStorage 'taxi_enhet').
 * Det skickas som huvudet x-taxi-enhet på alla anrop till vår Supabase-server, och servern skriver det
 * på loggraden tillsammans med IP-adress och webbläsare (se migration 20261029d_sakerhetslogg.sql).
 * Id:t säger inget om telefonen, det är bara ett slumptal. Det ligger kvar när man loggar ut.
 * Ångra: ta bort <script src="enhet.js"> från sidorna och den här filen. */
(function () {
  var KEY = 'taxi_enhet';
  var OK = /^[A-Za-z0-9-]{8,64}$/;
  var API = 'https://lpfdryvukqmjlgenuzpb.supabase.co/rest/v1/';
  function nytt() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
  }
  var id = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id || !OK.test(id)) { id = nytt(); localStorage.setItem(KEY, id); }
  } catch (e) { id = id && OK.test(id) ? id : null; }
  window.TAXI_ENHET = id;
  if (!id || typeof window.fetch !== 'function' || window.fetch.taxiEnhet) return;
  var orig = window.fetch;
  var wrapped = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input instanceof URL ? input.href : '');
      if (url && url.indexOf(API) === 0) {
        init = Object.assign({}, init || {});
        var h = new Headers(init.headers || {});
        if (!h.has('x-taxi-enhet')) h.set('x-taxi-enhet', id);
        init.headers = h;
      }
    } catch (e) {}
    return orig.call(window, input, init);
  };
  wrapped.taxiEnhet = true;
  window.fetch = wrapped;
})();
