// Notisprickar (badges) – återanvändbara i hela appen.
// Markera ett element med data-badge="nyckel" (t.ex. "profile" eller senare "messages").
// setBadge('profile', true) visar en röd prick, setBadge('messages', 3) visar en siffra, setBadge(nyckel, false/0) döljer.
(function () {
  var state = {};
  function apply(el) {
    var key = el.getAttribute('data-badge');
    var v = state[key];
    el.classList.add('badge-host');
    el.classList.toggle('has-badge', !!v);
    el.setAttribute('data-badge-text', typeof v === 'number' && v > 0 ? (v > 99 ? '99+' : String(v)) : '');
  }
  window.setBadge = function (key, value) {
    state[key] = value;
    document.querySelectorAll('[data-badge="' + key + '"]').forEach(apply);
  };
  // Kör efter att nya element ritats (t.ex. menyn), så rätt prickar syns där också
  window.refreshBadges = function () {
    document.querySelectorAll('[data-badge]').forEach(apply);
  };
})();
