/* Animationer i appen: ett överlager som kan visa stora figurer
 * över hela skärmen utan att blockera tryck.
 * Allt rör sig från höger till vänster och fordonen pekar åt vänster (texten
 * ritas aldrig spegelvänd).
 * Ankomster: när ett bevakat tåg, flyg eller båt ankommer (samma ögonblick
 * som ljudet) körs en helsidesanimation i ungefär 5 sekunder: ett landande
 * plan, tåget eller en Stenafärja. Inte vid försening, inställt, ny tid
 * eller andra statusuppdateringar (bev-watch-fire.detail.arrival).
 * Prognos: när en bevakad zon får en ny förbokning (prognos-notis.js ring())
 * visas zonens märke: Landvetter = ett plan som sveper förbi, Essity, Astra,
 * Volvo och Hotell Draken = loggan på ett kort som glider in, stannar och
 * glider ut (ca 6 s). Kräver inte ankomst (detail.prognos + detail.zone).
 * Loggorna visas bara för att känna igen zonen (varumärkena tillhör
 * respektive ägare). Astra och Volvo är egna förenklade teckningar.
 * Inställningen 'Animationer' (localStorage 'taxi_animationer', på som
 * standard) är fristående från ljudet (taxi_bev_ljud).
 * Ångra: ta bort den här filen, script-taggen och rutan i Inställningar,
 * och anropen i bevakning-ljud.js och prognos-notis.js (bev-watch-fire). */
(function () {
  'use strict';
  var KEY = 'taxi_animationer';
  var DURATION_MS = 5000;
  var REDUCED_MS = 1600;
  var LOGO_MS = 6000;
  var LOGO_REDUCED_MS = 2400;
  var MAX_ON_SCREEN = 1;
  // Ankomst (kräver detail.arrival) och prognoszoner (kräver det inte)
  var ARRIVAL_KINDS = { tag: 1, flyg: 1, bat: 1 };
  var LOGO_KINDS = { essity: 1, astra: 1, volvo: 1, draken: 1 };
  var ZONE_KINDS = { landvetter: 1, essity: 1, astra: 1, volvo: 1, draken: 1 };
  // Magasinet (290) är dold i Prognos och har ingen animation
  var ZONE_KIND = { '161': 'essity', '163': 'astra', '406': 'volvo', '432': 'volvo', '15': 'draken', '293': 'landvetter' };

  function read() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || ''); } catch (e) { o = {}; }
    if (!o || typeof o !== 'object') o = {};
    return { on: o.on !== false };
  }
  function write(s) {
    try { localStorage.setItem(KEY, JSON.stringify({ on: !!(s && s.on) })); } catch (e) {}
  }
  function isOn() { return read().on !== false; }
  function setOn(on) { write({ on: !!on }); try { document.dispatchEvent(new CustomEvent('animationer-change')); } catch (e) {} }

  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function zoneKind(zone) { return ZONE_KIND[String(zone == null ? '' : zone)] || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Fönsterrad på planet (egna enkla former, inte emoji)
  function windowRow() {
    var s = '';
    for (var x = 74; x <= 186; x += 7) s += '<rect x="' + x + '" y="37.5" width="3.6" height="4.4" rx="1.4"/>';
    return s;
  }
  var ICONS = {
    // Landande trafikflygplan från sidan: hjulen nere, landningsljus (flyg ankomst)
    flyg: '<svg viewBox="0 0 240 84" width="100%" height="100%" aria-hidden="true"><g transform="matrix(-1 0 0 1 240 0)">' +
      '<path fill="currentColor" d="M2 37l40 2 3 4-36-1z"/>' +
      '<path fill="currentColor" d="M14 30L22 4h12l30 29h128c20 0 34 4 42 12-8 5-22 7-40 7H72c-20 0-42-6-58-14z"/>' +
      '<path fill="#000" fill-opacity=".14" d="M2 37l40 2 3 4-36-1z"/>' +
      '<g fill="#fff" fill-opacity=".55">' + windowRow() + '</g>' +
      '<path fill="#fff" fill-opacity=".65" d="M211 37.5l10 1 6 4.5-14-.5z"/>' +
      '<rect x="198" y="36" width="5" height="10" rx="1.5" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width=".8"/>' +
      '<path fill="currentColor" d="M152 46h-44L86 66h12z"/><path fill="#000" fill-opacity=".18" d="M152 46h-44L86 66h12z"/>' +
      '<rect x="112" y="52" width="32" height="12" rx="6" fill="currentColor"/><rect x="112" y="52" width="32" height="12" rx="6" fill="#000" fill-opacity=".1"/>' +
      '<ellipse cx="143" cy="58" rx="2.4" ry="5" fill="#fff" fill-opacity=".4"/>' +
      '<g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M106 51v22"/><path d="M212 50v23"/></g>' +
      '<g fill="#2d3748" stroke="#a0aec0" stroke-width="1"><circle cx="101.5" cy="77" r="4.6"/><circle cx="110.5" cy="77" r="4.6"/><circle cx="212" cy="77.4" r="4.2"/></g>' +
      '<g fill="#cbd5e0"><circle cx="101.5" cy="77" r="1.6"/><circle cx="110.5" cy="77" r="1.6"/><circle cx="212" cy="77.4" r="1.4"/></g>' +
      '<circle cx="229" cy="47.5" r="4" fill="#fefcbf" fill-opacity=".35"/><circle cx="229" cy="47.5" r="1.8" fill="#fffff0"/>' +
      '</g></svg>',
    // Plan som sveper förbi (Landvetter-prognos), samma rörelse som den gamla flyganimationen
    landvetter: '<svg viewBox="0 0 64 32" width="100%" height="100%" aria-hidden="true"><g transform="matrix(-1 0 0 1 64 0)">' +
      '<path d="M-26 13h18M-36 17.5h24M-24 22h16" stroke="currentColor" stroke-opacity=".45" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path fill="currentColor" d="M62 17c-1.2 0-8.5-1.1-13.2-1.8L36.4 4.2c-.4-.5-1-.8-1.6-.8h-3.1l7.4 11.1H22.6L16 9.4c-.3-.4-.8-.6-1.3-.6h-2.7l4.2 8.3H4.2C2.4 17.1 1 16 1 16s1.2 1.4 2.6 2.1l13.6.9-4.4 7.2c-.2.4 0 .9.5 1.1.2.1.4.1.6.1h2.6c.5 0 1-.3 1.3-.7l5.2-8H40l-6.6 11h3.2c.7 0 1.3-.3 1.7-.8l10.8-13.2c5.2.7 12 1.8 13 1.8 1.2 0 2-.5 2-1.2s-.9-1.2-2.1-1.2z"/></g></svg>',
    tag: '<svg viewBox="0 0 72 28" width="100%" height="100%" aria-hidden="true"><g transform="matrix(-1 0 0 1 72 0)"><path fill="currentColor" d="M4 6.5c0-1.4 1.1-2.5 2.5-2.5H42c.8 0 1.5.4 1.9 1.1L50 12h12.5c2 0 3.5 1.4 3.5 3.2V20H4V6.5z"/><rect x="8" y="8" width="8" height="6" rx="1" fill="#fff" fill-opacity=".35"/><rect x="19" y="8" width="8" height="6" rx="1" fill="#fff" fill-opacity=".35"/><rect x="30" y="8" width="8" height="6" rx="1" fill="#fff" fill-opacity=".35"/><circle cx="14" cy="22.5" r="3.2" fill="currentColor"/><circle cx="14" cy="22.5" r="1.2" fill="#fff" fill-opacity=".5"/><circle cx="28" cy="22.5" r="3.2" fill="currentColor"/><circle cx="28" cy="22.5" r="1.2" fill="#fff" fill-opacity=".5"/><circle cx="54" cy="22.5" r="3.2" fill="currentColor"/><circle cx="54" cy="22.5" r="1.2" fill="#fff" fill-opacity=".5"/><path fill="currentColor" d="M50 12l6.2-7.2c.3-.4.8-.6 1.3-.6H62v8H50z"/></g></svg>',
    // Stenafärja (egen teckning): vitt skrov och överbyggnad, blått band, STENA LINE, röd skorsten med vitt S
    bat: '<svg viewBox="0 -8 240 88" width="100%" height="100%" aria-hidden="true"><g transform="matrix(-1 0 0 1 240 0)"><path d="M2 75q9-4 18 0t18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0" fill="none" stroke="#63b3ed" stroke-width="2.2" stroke-linecap="round" stroke-opacity=".85"/><path fill="#16325c" d="M8 54h220l-10 13c-2 3-5 4-9 4H22c-6 0-10-3-12-7z"/><path fill="#fff" stroke="#cbd5e0" stroke-width=".6" d="M6 36h216c5 0 9 3 12 7l-6 11H8z"/><path fill="#1d4f91" d="M8 50.5h221.9l-1.9 3.5H8z"/><path fill="#fff" stroke="#cbd5e0" stroke-width=".6" d="M18 36V25h180l12 11z"/><path fill="#fff" stroke="#cbd5e0" stroke-width=".6" d="M34 25V15h148l10 10z"/><path fill="#fff" stroke="#cbd5e0" stroke-width=".6" d="M146 15V8h40l6 7z"/><g fill="none" stroke="#1d3a6e" stroke-opacity=".8"><path d="M22 30.5h172" stroke-width="3.4" stroke-dasharray="3.6 2.4"/><path d="M38 20h140" stroke-width="3.2" stroke-dasharray="3.6 2.4"/><path d="M150 11.4h38" stroke-width="3"/><path d="M14 41.5h44M180 41.5h40" stroke-width="2" stroke-dasharray="2 3"/></g><path fill="#d71920" d="M70 15l4-21h24l-3 21z"/><path fill="#1d4f91" d="M74-6h24l-.8 4H73.2z"/><path fill="#fff" d="M73.2-2h24l-.3 1.6H72.9z"/><path d="M170 8V-3M165.5 0h9" stroke="#e2e8f0" stroke-width="1.6" stroke-linecap="round"/><path d="M220 68q9-1 16 5M214 70q6 0 10 4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".9"/></g><text x="68" y="47.6" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="11" fill="#16325c" textLength="108" lengthAdjust="spacingAndGlyphs">STENA LINE</text><text x="155.4" y="11.6" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="12.5" fill="#fff">S</text></svg>'
  };
  // Zonloggor på kort. Essity: förenklat officiellt märke. Volvo och Astra: egna förenklade teckningar.
  // Draken: guldskölden från Drakens grafiska profil (Brasserie Draken, utan ordet) + HOTELL DRAKEN, guld på mörkt kort.
  var LOGOS = {
    essity: '<svg viewBox="0 0 112 28" width="100%" height="100%" aria-hidden="true"><path d="M103.4  28H99.6L102.5  20.9L96.2  6.7H100.4L104.5  16.6L108.2  6.7H112L103.4  28Z" fill="#00005a"/><rect x="79.9" y="6.7" width="3.9" height="15.9" fill="#00005a"/><path d="M81.8  0C80.5  0  79.5  1  79.5  2.2C79.5  3.5  80.5  4.4  81.8  4.4C83.1  4.4  84.1  3.4  84.1  2.2C84.1  1  83.1  0  81.8  0Z" fill="#00005a"/><path d="M95  22.5V19.3C94.4  19.6  93.8  19.7  93.1  19.7C92  19.7  91.5  19.1  91.5  17.8V9.7H94.9V6.7H91.5V3.3H87.6V6.7H85.6V9.7H87.6V18.1C87.6  21.2  89.3  22.9  92.5  22.9C93.5  22.9  94.3  22.8  95  22.5V22.5Z" fill="#00005a"/><path d="M56.8  9.3C55.3  9.3  54.4  9.9  54.4  11C54.4  12.1  55.1  12.5  57.5  12.9C61.3  13.5  63.5  14.5  63.5  17.8C63.5  21.1  61.2  22.9  57.1  22.9C50.2  23  50.4  17.5  50.4  17.5H54.1C54.2  19.3  55.2  20  57.1  20C59  20  59.8  19.4  59.8  18.1C59.8  17  59  16.5  56.5  16.1C52.3  15.4  50.8  14.1  50.8  11.2C50.8  9.7  51.4  8.5  52.7  7.6C53.7  6.8  55.2  6.4  56.8  6.4C59.7  6.4  62.6  7.3  63  11.4H59.4C59.4  11.4  59.3  10.4  58.7  9.9C58.3  9.5  57.7  9.3  56.8  9.3H56.8Z" fill="#00005a"/><path d="M71.1  9.3C69.7  9.3  68.8  9.9  68.8  11C68.8  12.1  69.5  12.5  71.9  12.9C75.6  13.5  77.8  14.5  77.8  17.8C77.8  21.1  75.5  22.9  71.5  22.9C64.5  23  64.8  17.5  64.8  17.5H68.4C68.6  19.3  69.5  20  71.4  20C73.4  20  74.1  19.4  74.1  18.1C74.1  17  73.3  16.5  70.9  16.1C66.6  15.4  65.1  14.1  65.1  11.2C65.1  9.7  65.8  8.5  67  7.6C68.1  6.8  69.5  6.4  71.1  6.4C74  6.4  77  7.3  77.4  11.4H73.8C73.8  11.4  73.6  10.4  73  9.9C72.6  9.5  72.1  9.3  71.1  9.3H71.1Z" fill="#00005a"/><path d="M49.1  14.4C49.1  11.8  48.4  9.7  46.9  8.3C45.6  7.1  43.8  6.4  41.6  6.4C37  6.4  33.8  9.8  33.8  14.6V14.9C33.8  19.7  37  22.9  41.8  22.9C46.6  22.9  48.8  20.6  49.1  17.5H45.4C45.2  18.8  44.4  20  41.9  20C39.4  20  37.9  18.4  37.7  15.6H49.2V14.4L49.1  14.4ZM37.8  12.9C38.2  10.6  39.6  9.3  41.6  9.3C43.9  9.3  45.1  10.5  45.3  12.9H37.8Z" fill="#00005a"/><path d="M13  5C13  3.5  12.6  2.4  11.8  1.6C11.1  1  10.1  .6  8.9  .6C6.4  .6  4.6  2.4  4.6  5.1V5.2C4.6  7.8  6.4  9.6  9  9.6C11.6  9.6  12.8  8.3  13  6.7H11C10.9  7.4  10.4  8  9.1  8C7.7  8  6.9  7.2  6.8  5.6H13V5V5ZM6.8  4.2C7  2.9  7.8  2.2  8.9  2.2C10.1  2.2  10.8  2.8  10.9  4.2H6.8Z" fill="#00005a"/><path d="M13.9  5.6H20.1C20  7.2  19.2  8  17.8  8C16.4  8  16  7.4  15.9  6.7H13.9C14.1  8.3  15.4  9.6  17.9  9.6C20.5  9.6  22.2  7.8  22.2  5.2V5.1C22.2  2.4  20.5  .6  17.9  .6C16.8  .6  15.8  1  15.1  1.6C14.3  2.4  13.9  3.5  13.9  5V5.6V5.6ZM15.9  4.2C16.1  2.8  16.7  2.2  17.9  2.2C19.1  2.2  19.8  2.9  20  4.2H15.9Z" fill="#f50082"/><path d="M18.5  14.7H24.7C24.6  16.3  23.8  17.1  22.4  17.1C21  17.1  20.6  16.5  20.5  15.8H18.5C18.7  17.5  20  18.7  22.5  18.7C25.1  18.7  26.9  17  26.9  14.3V14.2C26.9  11.6  25.1  9.7  22.6  9.7C21.4  9.7  20.4  10.1  19.7  10.8C18.9  11.5  18.5  12.7  18.5  14.1V14.7V14.7ZM20.6  13.3C20.7  12  21.3  11.3  22.6  11.3C23.7  11.3  24.5  12  24.7  13.3H20.6Z" fill="#f50082"/><path d="M13.9  24H20.1C20  25.5  19.2  26.4  17.8  26.4C16.4  26.4  16  25.7  15.9  25H13.9C14.1  26.7  15.4  28  17.9  28C20.5  28  22.2  26.2  22.2  23.6V23.5C22.2  20.8  20.5  19  17.9  19C16.8  19  15.8  19.3  15.1  20C14.3  20.8  13.9  21.9  13.9  23.4V24V24ZM15.9  22.5C16.1  21.2  16.7  20.6  17.9  20.6C19.1  20.6  19.8  21.3  20  22.5H15.9Z" fill="#f50082"/><path d="M8.4  14.1C8.4  12.7  8  11.5  7.1  10.8C6.4  10.1  5.4  9.7  4.3  9.7C1.8  9.7  0  11.6  0  14.2V14.3C0  17  1.8  18.7  4.4  18.7C7  18.7  8.2  17.5  8.4  15.8H6.3C6.2  16.5  5.8  17.1  4.4  17.1C3.1  17.1  2.2  16.3  2.2  14.8H8.4V14.1V14.1ZM2.2  13.3C2.4  12  3.2  11.3  4.3  11.3C5.5  11.3  6.2  12  6.3  13.3H2.2Z" fill="#00005a"/><path d="M17.6  14.1C17.6  12.7  17.2  11.5  16.4  10.8C15.7  10.1  14.7  9.7  13.5  9.7C11  9.7  9.2  11.6  9.2  14.2V14.3C9.2  17  11  18.7  13.6  18.7C16.2  18.7  17.4  17.5  17.6  15.8H15.6C15.5  16.5  15  17.1  13.7  17.1C12.3  17.1  11.5  16.3  11.4  14.8H17.6V14.1V14.1ZM11.4  13.3C11.6  12  12.4  11.3  13.5  11.3C14.7  11.3  15.4  12  15.5  13.3H11.4Z" fill="#00005a"/><path d="M13  23.4C13  21.9  12.6  20.8  11.8  20C11.1  19.3  10.1  19  8.9  19C6.4  19  4.6  20.8  4.6  23.5V23.6C4.6  26.2  6.4  28  9  28C11.6  28  12.8  26.7  13  25H11C10.9  25.7  10.4  26.4  9.1  26.4C7.7  26.4  6.9  25.5  6.8  24H13V23.4V23.4ZM6.8  22.5C7  21.3  7.8  20.6  8.9  20.6C10.1  20.6  10.8  21.2  10.9  22.5H6.8Z" fill="#00005a"/></svg>',
    astra: '<svg viewBox="0 0 220 74" width="100%" height="100%" aria-hidden="true">' +
      '<text x="110" y="46" text-anchor="middle" font-family="\'Helvetica Neue\',Arial,Helvetica,sans-serif" font-weight="700" font-size="48" fill="#830051" textLength="156" lengthAdjust="spacingAndGlyphs">Astra</text>' +
      '<path d="M40 55h140" stroke="#f0ab00" stroke-width="2.4" stroke-linecap="round"/>' +
      '<text x="110" y="70" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="11" fill="#5b2149" textLength="150" lengthAdjust="spacingAndGlyphs">ASTRAZENECA · MÖLNDAL</text></svg>',
    volvo: '<svg viewBox="0 0 104 100" width="100%" height="100%" aria-hidden="true">' +
      '<g fill="none" stroke="#003057" stroke-width="7"><circle cx="50" cy="54" r="40"/><path d="M78.3 25.7L90 14"/></g>' +
      '<path fill="#003057" d="M99 5v18L81 5z"/>' +
      '<text x="50" y="60.5" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" font-weight="700" font-size="17" fill="#003057" textLength="62" lengthAdjust="spacingAndGlyphs">VOLVO</text></svg>',
    draken: '<svg viewBox="0 0 384 130" width="100%" height="100%" aria-hidden="true">' +
      '<g fill="#ccba8d" transform="translate(6 7) scale(.49)"><path d="m97.1 216.5c-2-51.1-23.4-96.1-55.3-124.2-1.3-1.2-2.7-2.3-4-3.4-1.5 .9-3.1 1.8-4.7 2.6-5.4 3-11 5.6-16.7 8-1.7 .7-3.4 1.3-5 2 .3 1.7 .6 3.4 .9 5.1 10.1 51.5 40.1 93.5 79.6 113 1.8 .9 3.5 1.7 5.4 2.5 0-1.9-.1-3.7-.1-5.6ZM17.4 104.6c6.9-2.8 13.5-6 20-9.7 30.8 26.5 51.7 69.5 54.4 118.9-37-19.2-65-59.7-74.3-109.2Z"/><path d="m102.6 164.7c3.5-14.8 5.3-30.4 5.3-46.5V2.8c0-3-4-3.8-5.2-1.2l-.1 .1c-14.8 31.4-37.1 57.5-64.2 75-1.5 1-3 1.9-4.6 2.9-9.2 5.5-18.9 10-28.9 13.4-.9 .3-1.9 .6-2.9 .9-1.3 .4-2.2 1.7-2 3.1 .1 .9 .3 1.9 .4 2.8 9.8 64.5 49.8 116.7 101.9 135.1 .1 0 .2 .1 .3 .1 .4 .1 1 .3 1.6 .5 1.8 .6 3.7-.8 3.7-2.7v-1.5s0-6.9 0-6.9c0-16.1-1.9-31.7-5.3-46.5-.5-2.2-1.1-4.5-1.7-6.7v0c.6-2.2 1.2-4.4 1.7-6.7Zm-4.7 16.6h0c3 13.8 4.7 28.3 4.7 43.2v5.1s-.1 0-.1 0C52.8 211.5 14.8 160.8 5.5 98.2c11.4-3.9 22.3-9 32.6-15.4 1.5-.9 3-1.9 4.5-2.9 24.6-16.2 45.2-39.2 60-66.7v105c0 14.9-1.6 29.4-4.7 43.2-.7 3.4-1.6 6.7-2.5 9.9 .9 3.3 1.7 6.6 2.5 9.9Z"/><path d="m92 39.6c-12.8 17.3-28.1 32.1-45.3 43.7-1.4 1-2.9 1.9-4.4 2.9 1.3 1.1 2.7 2.2 4 3.4 18.2 16.3 32.9 37.7 42.8 62.5 1.1 2.6 2 5.3 3 8 .2 .5 .4 1 .5 1.5 .7-3.3 1.4-6.6 2-9.9 1.9-10.8 2.8-22 2.8-33.5V32c-1.7 2.6-3.5 5.1-5.3 7.5Zm0 78.6c0 8.2-.5 16.2-1.5 24.1-9.9-21.7-23.5-40.7-39.9-55.6 15.5-10.6 29.4-23.7 41.4-38.7v70.3Z"/><path d="m213.6 99.5c-29.7-12.2-55.7-33.1-75.5-59.9-1.8-2.5-3.6-5-5.3-7.5v190c1.8-.8 3.6-1.6 5.3-2.5 39.5-19.5 69.6-61.5 79.6-113 .3-1.7 .6-3.4 .9-5.1-1.7-.6-3.4-1.3-5-2Zm-75.5 114.5V48c20.1 25.2 45.6 44.9 74.6 56.7-9.3 49.6-37.5 90.2-74.6 109.3Z"/><path d="m225.2 93c-42.2-14.3-77.3-47.6-97.7-91.3l-.1-.1c-1.2-2.7-5.2-1.8-5.2 1.2v230.1c0 1.9 1.9 3.3 3.8 2.7 .5-.2 1-.3 1.6-.5 52.3-18.4 92.3-70.6 102.2-135.2 .1-.9 .3-1.9 .4-2.8 .2-1.4-.7-2.7-2-3.1-1-.3-1.9-.6-2.9-.9Zm-97.7 136.6V13.2c21.7 40.5 56.2 71.2 97.1 84.9-9.2 62.7-47.3 113.4-97.1 131.5Z"/></g>' +
      '<g fill="none" stroke="#ccba8d" stroke-width="1.6" font-family="Oswald,\'Bebas Neue\',\'Arial Narrow\',Arial,sans-serif" font-weight="700">' +
      '<text x="136" y="50" font-size="38" textLength="150" lengthAdjust="spacingAndGlyphs">HOTELL</text>' +
      '<text x="136" y="118" font-size="64" textLength="240" lengthAdjust="spacingAndGlyphs">DRAKEN</text></g></svg>'
  };
  var LOGO_NAME = { essity: 'Essity', astra: 'Astra', volvo: 'Volvo', draken: 'Hotell Draken' };

  var layer = null;
  function ensureStyle() {
    if (document.getElementById('animationer-style')) return;
    var css = document.createElement('style');
    css.id = 'animationer-style';
    var AW = 'clamp(220px,78vw,620px)';
    css.textContent =
      '#animationer-layer{position:fixed;inset:0;z-index:240;pointer-events:none!important;overflow:hidden}' +
      '#animationer-layer *{pointer-events:none!important}' +
      '.anim-veil{position:absolute;inset:0;background:rgba(12,22,36,.22);opacity:0;animation:anim-veil 5s ease forwards}' +
      'html:not([data-theme="dark"]) .anim-veil{background:rgba(20,40,70,.14)}' +
      '@keyframes anim-veil{0%{opacity:0}8%{opacity:1}84%{opacity:1}100%{opacity:0}}' +
      '.anim-actor{position:absolute;left:0;top:0;width:' + AW + ';height:auto;color:#2b6cb0;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35));will-change:transform,opacity;opacity:0}' +
      'html[data-theme="dark"] .anim-actor,html[data-theme="dark"] .anim-land{color:#90cdf4;filter:drop-shadow(0 8px 22px rgba(0,0,0,.55))}' +
      '.anim-actor svg,.anim-scene svg{display:block;overflow:visible}' +
      // Scen (flyg ankomst och zonloggor): delarna följer scenens längd via --ad/--adl/--aps
      '.anim-scene{position:absolute;inset:0;--aw:' + AW + '}' +
      '#animationer-layer .anim-part{animation-duration:var(--ad,5s);animation-delay:var(--adl,0s);animation-play-state:var(--aps,running);animation-fill-mode:forwards}' +
      // Flyg ankomst: planet sjunker mot banan, sätter ner hjulen (rökpuff) och rullar ut
      '.anim-runway{position:absolute;left:-4vw;right:-4vw;bottom:calc(20% + env(safe-area-inset-bottom,0px) - 11px);height:11px;border-radius:3px;background:#4a5568 repeating-linear-gradient(90deg,transparent 0 22px,rgba(255,255,255,.85) 22px 46px) center/100% 2px no-repeat;box-shadow:0 -2px 0 rgba(255,255,255,.18),0 6px 16px rgba(0,0,0,.3);opacity:0;animation-name:anim-runway;animation-timing-function:ease}' +
      '@keyframes anim-runway{0%{opacity:0}12%{opacity:.95}88%{opacity:.95}100%{opacity:0}}' +
      '.anim-land{position:absolute;right:0;bottom:calc(20% + env(safe-area-inset-bottom,0px));width:var(--aw);color:#2b6cb0;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35));transform-origin:56% 98%;will-change:transform,opacity;opacity:0;animation-name:anim-land;animation-timing-function:linear}' +
      '@keyframes anim-land{0%{transform:translate3d(92vw,-50vh,0) rotate(-7deg);opacity:0}6%{opacity:.97}' +
        '44%{transform:translate3d(2vw,-7vh,0) rotate(-4deg)}52%{transform:translate3d(-8vw,-1vh,0) rotate(3deg);animation-timing-function:ease-out}' +
        '57%{transform:translate3d(-13vw,0,0) rotate(2.5deg);animation-timing-function:ease-out}66%{transform:translate3d(-24vw,0,0) rotate(0deg);animation-timing-function:ease-out}' +
        '90%{transform:translate3d(-46vw,0,0) rotate(0deg);opacity:.97}100%{transform:translate3d(-52vw,0,0) rotate(0deg);opacity:0}}' +
      '.anim-puff{position:absolute;right:calc(13vw + var(--aw) * .44 - 34px);bottom:calc(20% + env(safe-area-inset-bottom,0px) - 6px);width:68px;height:26px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(240,244,248,.95) 0,rgba(226,232,240,.7) 45%,rgba(226,232,240,0) 72%);opacity:0;animation-name:anim-puff;animation-timing-function:ease-out}' +
      '@keyframes anim-puff{0%,55%{transform:scale(.3);opacity:0}60%{transform:scale(1);opacity:.95}80%{transform:translate3d(28px,-4px,0) scale(1.9);opacity:0}100%{opacity:0}}' +
      // Landvetter-prognos: planet sveper förbi (samma bana som den gamla flyganimationen)
      '.anim-landvetter{left:auto;right:0;top:16%;animation:anim-sweep 5s ease-in-out forwards}' +
      '@keyframes anim-sweep{0%{transform:translate3d(80vw,10vh,0) rotate(8deg);opacity:0}8%{opacity:.96}88%{opacity:.96}100%{transform:translate3d(-108vw,-8vh,0) rotate(-5deg);opacity:0}}' +
      '.anim-tag{left:auto;right:0;top:auto;bottom:calc(12% + env(safe-area-inset-bottom,0px));animation:anim-tag 5s ease-in-out forwards}' +
      '.anim-bat{left:auto;right:0;top:auto;bottom:calc(12% + env(safe-area-inset-bottom,0px));transform-origin:50% 80%;animation:anim-bat 5s ease-in-out forwards}' +
      '@keyframes anim-tag{0%{transform:translate3d(80vw,0,0);opacity:0}8%{opacity:.96}18%{transform:translate3d(8vw,0,0)}22%{transform:translate3d(0,-6px,0)}40%{transform:translate3d(-28vw,0,0)}44%{transform:translate3d(-36vw,-6px,0)}62%{transform:translate3d(-58vw,0,0)}66%{transform:translate3d(-66vw,-6px,0)}88%{opacity:.96}100%{transform:translate3d(-108vw,0,0);opacity:0}}' +
      '@keyframes anim-bat{0%{transform:translate3d(80vw,0,0) rotate(0deg);opacity:0}8%{opacity:1}22%{transform:translate3d(4vw,-8px,0) rotate(1.2deg)}48%{transform:translate3d(-32vw,6px,0) rotate(-1deg)}74%{transform:translate3d(-68vw,-6px,0) rotate(1deg)}88%{opacity:1}100%{transform:translate3d(-108vw,3px,0) rotate(-.5deg);opacity:0}}' +
      // Zonloggor: glider in från höger (~0,8 s), stannar i mitten (~4 s), glider ut åt vänster (~1,2 s)
      '.anim-card{position:absolute;left:0;right:0;top:26%;margin:0 auto;width:clamp(220px,78vw,520px);box-sizing:border-box;padding:clamp(16px,5vw,30px) clamp(18px,6vw,36px) clamp(10px,3vw,16px);border-radius:22px;background:#fff;box-shadow:0 14px 40px rgba(0,0,0,.38);opacity:0;will-change:transform,opacity;animation-name:anim-zon;animation-timing-function:ease-in-out}' +
      '.anim-logo svg{width:100%;height:auto;max-height:34vh}' +
      '.anim-card-volvo .anim-logo{width:58%;margin:0 auto}' +
      '.anim-card-draken{background:#1b2033;border:1px solid rgba(204,186,141,.5)}' +
      '.anim-card-cap{margin-top:clamp(8px,2.4vw,14px);text-align:center;font-size:clamp(.85rem,3.6vw,1.05rem);font-weight:600;color:#4a5568;letter-spacing:.01em}' +
      '.anim-card-draken .anim-card-cap{color:#ccba8d}' +
      '@keyframes anim-zon{0%{transform:translate3d(110vw,0,0);opacity:0;animation-timing-function:cubic-bezier(.25,.8,.35,1)}4%{opacity:1}13.3%{transform:translate3d(0,0,0);animation-timing-function:ease-in-out}80%{transform:translate3d(0,0,0);opacity:1;animation-timing-function:cubic-bezier(.55,0,.75,.4)}96%{opacity:1}100%{transform:translate3d(-110vw,0,0);opacity:0}}' +
      // Minskad rörelse: kort tona in och ut på plats, ingen färd över skärmen
      '.anim-actor.anim-reduced{animation:anim-reduced 1.6s ease forwards!important;left:50%;right:auto;top:22%;bottom:auto;margin-left:-39vw;width:clamp(200px,78vw,480px)}' +
      '.anim-tag.anim-reduced,.anim-bat.anim-reduced{top:auto;bottom:calc(18% + env(safe-area-inset-bottom,0px))}' +
      '@keyframes anim-reduced{0%{transform:scale(.88);opacity:0}20%{transform:scale(1);opacity:.96}80%{transform:scale(1);opacity:.96}100%{transform:scale(.96);opacity:0}}' +
      '.anim-scene.anim-reduced{opacity:0;animation:anim-fade 1.6s ease forwards}' +
      '#animationer-layer .anim-scene.anim-reduced .anim-part{animation:none!important;opacity:1;transform:none}' +
      '.anim-scene.anim-reduced .anim-land{left:0;right:0;margin:0 auto}' +
      '.anim-scene.anim-reduced .anim-puff{display:none}' +
      '@keyframes anim-fade{0%{opacity:0}18%{opacity:1}82%{opacity:1}100%{opacity:0}}' +
      '@media (min-width:900px){.anim-actor{width:clamp(320px,62vw,680px)}.anim-scene{--aw:clamp(320px,62vw,680px)}.anim-actor.anim-reduced{margin-left:-31vw}}' +
      '.anim-try{min-height:32px;padding:4px 12px;border-radius:8px;border:1px solid var(--border,#cbd5e0);background:var(--surface,#fff);color:inherit;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;margin:0 6px 6px 0}';
    document.head.appendChild(css);
  }

  function ensureLayer() {
    ensureStyle();
    if (layer && layer.isConnected) return layer;
    layer = document.getElementById('animationer-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'animationer-layer';
      layer.setAttribute('aria-hidden', 'true');
    }
    if (document.body && !layer.isConnected) document.body.appendChild(layer);
    return layer;
  }

  function prune(host) {
    if (!host) return;
    var kids = host.children;
    while (kids.length >= MAX_ON_SCREEN) host.removeChild(kids[0]);
  }

  function durationOf(kind, reduced) {
    if (LOGO_KINDS[kind]) return reduced ? LOGO_REDUCED_MS : LOGO_MS;
    return reduced ? REDUCED_MS : DURATION_MS;
  }

  function sceneHtml(kind, opts) {
    if (kind === 'flyg') {
      return '<div class="anim-runway anim-part"></div><div class="anim-puff anim-part"></div>' +
        '<div class="anim-land anim-part">' + ICONS.flyg + '</div>';
    }
    var cap = opts.caption != null ? String(opts.caption) : 'Ny förbokning · ' + (LOGO_NAME[kind] || '');
    return '<div class="anim-card anim-card-' + kind + ' anim-part"><div class="anim-logo">' + (LOGOS[kind] || '') + '</div>' +
      (cap ? '<div class="anim-card-cap">' + esc(cap) + '</div>' : '') + '</div>';
  }

  function setVar(el, name, val) {
    try { if (el.style && el.style.setProperty) el.style.setProperty(name, val); } catch (e) {}
  }

  // kind: tag, flyg, bat (ankomst) eller landvetter, essity, astra, volvo, draken (prognos)
  function play(kind, opts) {
    opts = opts || {};
    if (!isOn() && !opts.force) return null;
    if (!ARRIVAL_KINDS[kind] && !ZONE_KINDS[kind]) return null;
    var host = ensureLayer();
    if (!host) return null;
    prune(host);
    var reduced = !opts.freezeAt && (opts.reduced != null ? !!opts.reduced : reduceMotion());
    var scene = kind === 'flyg' || !!LOGO_KINDS[kind];
    var el = document.createElement('div');
    el.className = (scene ? 'anim-scene' : 'anim-actor') + ' anim-' + kind + (reduced ? ' anim-reduced' : '');
    el.setAttribute('data-anim-kind', kind);
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = scene ? sceneHtml(kind, opts) : (ICONS[kind] || '');
    var ms = durationOf(kind, reduced);
    el.style.animationDuration = (ms / 1000) + 's';
    setVar(el, '--ad', (ms / 1000) + 's');
    if (opts.freezeAt != null) {
      var at = Math.max(0, Math.min(0.95, Number(opts.freezeAt) || 0));
      el.style.animationDelay = (-at * (ms / 1000)) + 's';
      el.style.animationPlayState = 'paused';
      setVar(el, '--adl', (-at * (ms / 1000)) + 's');
      setVar(el, '--aps', 'paused');
    } else {
      var veil = document.createElement('div');
      veil.className = 'anim-veil';
      veil.style.animationDuration = (ms / 1000) + 's';
      host.appendChild(veil);
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (veil.parentNode) veil.parentNode.removeChild(veil);
      }, ms + 80);
    }
    host.appendChild(el);
    return el;
  }

  // bev-watch-fire: ankomst (tag/flyg/bat) kräver detail.arrival.
  // Prognoszoner (detail.prognos + detail.zone, eller kind landvetter/essity/...) kräver det inte.
  function playFromEvent(e) {
    var d = e && e.detail;
    if (!d) return;
    var kind = d.kind || (d.prognos ? zoneKind(d.zone) : '');
    if (!kind) return;
    if (ZONE_KINDS[kind]) { play(kind, { caption: d.caption }); return; }
    if (!ARRIVAL_KINDS[kind] || !d.arrival) return;
    play(kind);
  }

  function renderSettings(box) {
    if (!box) return;
    ensureStyle();
    var on = isOn();
    var p = '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">';
    box.innerHTML = '<div class="section"><h3 style="margin-top:0">Animationer</h3>' +
      p + 'Ankomster: när ett bevakat flyg, tåg eller båt ankommer visas en stor figur över hela skärmen i ungefär fem sekunder. Flyget är ett plan som landar, båten är en Stenafärja. Bara vid själva ankomsten, inte vid försening eller andra statusuppdateringar.</p>' +
      p + 'Prognos: när en zon du bevakar får en ny förbokning (samma notis som förut) visas zonens märke. Landvetter: ett plan som sveper förbi, med säkerhetsbältesljudet. Essity, Astra, Volvo och Hotell Draken: loggan glider in, stannar en stund och glider ut.</p>' +
      p + 'Av stänger bara av animationerna, inte ljudet.</p>' +
      '<div class="hl-opts" role="radiogroup" aria-label="Animationer">' +
        '<label class="hl-opt' + (!on ? ' on' : '') + '"><input type="radio" name="animationer" value="0"' + (!on ? ' checked' : '') + '><span>Av</span></label>' +
        '<label class="hl-opt' + (on ? ' on' : '') + '"><input type="radio" name="animationer" value="1"' + (on ? ' checked' : '') + '><span>På</span></label>' +
      '</div>' +
      '<p style="margin:.55rem 0 0;font-size:.85rem;color:var(--text-soft)">Ankomster</p><p style="margin:.2rem 0 0">' +
        '<button type="button" class="anim-try" data-anim-try="flyg">Prova flyg</button>' +
        '<button type="button" class="anim-try" data-anim-try="tag">Prova tåg</button>' +
        '<button type="button" class="anim-try" data-anim-try="bat">Prova båt</button></p>' +
      '<p style="margin:.35rem 0 0;font-size:.85rem;color:var(--text-soft)">Prognos</p><p style="margin:.2rem 0 0">' +
        '<button type="button" class="anim-try" data-anim-try="landvetter">Prova Landvetter</button>' +
        '<button type="button" class="anim-try" data-anim-try="essity">Prova Essity</button>' +
        '<button type="button" class="anim-try" data-anim-try="astra">Prova Astra</button>' +
        '<button type="button" class="anim-try" data-anim-try="volvo">Prova Volvo</button>' +
        '<button type="button" class="anim-try" data-anim-try="draken">Prova Draken</button></p>' +
      '</div>';
    box.onchange = function (e) {
      if (!e.target || e.target.name !== 'animationer') return;
      setOn(e.target.value === '1');
      renderSettings(box);
    };
    box.onclick = function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-anim-try]');
      if (!b) return;
      e.preventDefault();
      var k = b.getAttribute('data-anim-try') || 'flyg';
      play(k, { force: true });
      // Landvetter-prognosen har säkerhetsbältesljudet (ljud/flyg.mp3)
      var L = window.BEV_LJUD;
      if (k === 'landvetter' && L && L.play) { try { if (L.unlock) L.unlock(); L.play('flyg', true); } catch (err) {} }
    };
  }

  if (document.addEventListener) {
    document.addEventListener('bev-watch-fire', playFromEvent);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureLayer);
    else if (document.body) ensureLayer();
  }
  if (window.addEventListener) {
    window.addEventListener('storage', function (e) { if (e && e.key === KEY) { try { document.dispatchEvent(new CustomEvent('animationer-change')); } catch (err) {} } });
  }

  window.ANIMATIONER = {
    isOn: isOn,
    setOn: setOn,
    read: read,
    play: play,
    playFromEvent: playFromEvent,
    zoneKind: zoneKind,
    renderSettings: renderSettings,
    reduceMotion: reduceMotion,
    layer: ensureLayer,
    key: KEY,
    durationMs: DURATION_MS,
    logoMs: LOGO_MS
  };
})();
