/* Namn som visas för andra (och i delade vyer): förnamn + första bokstaven i efternamnet, t.ex. "Christian P".
 * Hela namnet visas bara där man tittar på sig själv (profil/kontoinställningar).
 * Långa förnamn kortas: först behålls bara första förnamnet ("Anna-Karin Elisabeth" -> "Anna-Karin",
 * "Carl-Johannes" -> "Carl"), och är det fortfarande längre än 12 tecken kortas det med "…".
 * Saknas namn visas reservtexten (oftast förar-id).
 *   shortName("Christian Parsa")          -> "Christian P"
 *   shortNameParts("Per Olof", "Svensson") -> "Per Olof S"
 * Ångra: ta bort filen och script-taggarna; anropen faller tillbaka på namnet som det är. */
(function () {
  var MAX = 12;
  var PART = /^(von|van|der|den|de|af|av|la|le|du|da|di|dos|del|zu)$/i;
  function cut(s) { return s.length > MAX ? s.slice(0, MAX - 1).replace(/[\s-]+$/, '') + '…' : s; }
  function firstPart(f) {
    f = String(f || '').trim().replace(/\s+/g, ' ');
    if (f.length <= MAX) return f;
    var p = f.split(' ')[0];
    if (p.length > MAX) p = p.split('-')[0];
    return cut(p);
  }
  function initial(l) {
    var t = String(l || '').trim().replace(/\s+/g, ' ').split(' ').filter(function (w) { return !PART.test(w); });
    var w = (t[0] || String(l || '').trim()).replace(/^[^\p{L}]+/u, '');
    return w ? w.charAt(0).toUpperCase() : '';
  }
  function shortNameParts(first, last, fallback) {
    var f = firstPart(first);
    if (!f) return fallback != null ? String(fallback) : '';
    var i = initial(last);
    return i ? f + ' ' + i : f;
  }
  function shortName(full, fallback) {
    var s = String(full == null ? '' : full).trim().replace(/\s+/g, ' ');
    if (!s) return fallback != null ? String(fallback) : '';
    if (/^(Förare|Föraren|Ägaren|Demoförare|Du|Jag)\b/.test(s) || /^\d+$/.test(s)) return s;   // reservtexter och förar-id
    var w = s.split(' ');
    if (w.length === 1) return firstPart(s);
    if (/^\d+$/.test(w[w.length - 1])) return s;                        // "Förare 12" o.d.
    var k = w.length - 1;                                                // efternamn = sista ordet (+ ev. "von", "af" …)
    while (k > 1 && PART.test(w[k - 1])) k--;
    return shortNameParts(w.slice(0, k).join(' '), w.slice(k).join(' '), fallback);
  }
  window.shortName = shortName;
  window.shortNameParts = shortNameParts;
})();
