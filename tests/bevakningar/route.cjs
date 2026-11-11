const assert = require('node:assert/strict');
function inWindow(schedMin, atMin, slack) {
  if (schedMin < 0 || atMin < 0) return false;
  const d = Math.abs(schedMin - atMin);
  return Math.min(d, 1440 - d) <= (slack == null ? 15 : slack);
}
let n = 0;
const check = (ok, msg) => { assert.ok(ok, msg); n++; };
check(inWindow(5 * 60 + 40, 5 * 60 + 40), 'exakt tid');
check(inWindow(5 * 60 + 40, 5 * 60 + 55), '15 min senare');
check(!inWindow(5 * 60 + 40, 5 * 60 + 56), '16 min är utanför');
check(inWindow(5 * 60 + 40, 5 * 60 + 25), '15 min tidigare');
check(inWindow(0, 1440 - 10), 'över midnatt bakåt');
check(inWindow(0, 15), 'över midnatt framåt');
check(!inWindow(0, 16), '16 min efter midnatt räknas inte till 00:00');
console.log(n + ' route-window assertions passed (±15 min, wrapping midnatt).');
