// Valkompass 2.0 – ren logik utan DOM. Används av appen (webbläsaren) och av testerna (Node).
export const SCALE = ["Helt emot", "Delvis emot", "Neutral", "Delvis för", "Helt för"]; // index 0..4 = värde -2..2
export const PARTY_ORDER = ["s", "m", "sd", "c", "v", "kd", "l", "mp"];

export const isCore = (s) => s.tier === "core" && s.approved === true;
export const poleSign = (s) => ((s.agreePole || s.rightPole) === "pos" ? 1 : -1);

/** Alla kärnfrågor (påståenden + scenarier) i filens ordning. */
export function coreQuestions(statements) {
  return statements.filter(isCore);
}
export function coreValues(values) {
  return values.filter(isCore);
}

/** party -> statementId -> position (bara positioner med värde). */
export function positionIndex(positions) {
  const idx = {};
  for (const p of positions) {
    (idx[p.party] ||= {});
    idx[p.party][p.statementId] = p;
  }
  return idx;
}

/**
 * Matchning för ett parti.
 * answers: { id: -2..2 | null }  (null = hoppade över)
 * important: Set av id med dubbel vikt
 * Räknar bara frågor där både användaren och partiet har ett värde. Partiets "saknas" ger inget straff.
 */
export function matchParty(answers, partyPos, important = new Set()) {
  let sum = 0, wsum = 0, n = 0, missing = 0;
  for (const [id, u] of Object.entries(answers)) {
    if (u === null || u === undefined) continue;
    const pos = partyPos?.[id];
    if (!pos || pos.value === null || pos.value === undefined) {
      if (pos) missing++; // partiet tog inte ställning (saknas)
      continue;
    }
    const w = important.has(id) ? 2 : 1;
    sum += w * (1 - Math.abs(u - pos.value) / 4);
    wsum += w;
    n++;
  }
  return { pct: wsum ? (100 * sum) / wsum : null, compared: n, missing };
}

export function rankParties(answers, posIdx, important, partyIds = PARTY_ORDER) {
  return partyIds
    .map((id) => ({ id, ...matchParty(answers, posIdx[id], important) }))
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

/** Förklaring: största överens/oense för ett parti. */
export function explain(answers, partyPos, important, byId, k = 3) {
  const rows = [];
  for (const [id, u] of Object.entries(answers)) {
    if (u === null || u === undefined) continue;
    const pos = partyPos?.[id];
    if (!pos || pos.value === null || pos.value === undefined) continue;
    rows.push({ id, u, p: pos.value, d: Math.abs(u - pos.value), important: important.has(id), pos, q: byId[id] });
  }
  const agree = rows.filter((r) => r.d <= 1)
    .sort((a, b) => a.d - b.d || b.important - a.important || Math.abs(b.p) - Math.abs(a.p)).slice(0, k);
  const disagree = rows.filter((r) => r.d >= 2)
    .sort((a, b) => b.d - a.d || b.important - a.important).slice(0, k);
  return { agree, disagree };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Snitt per axel. Bidrag = värde * polens tecken, så + pekar alltid mot axelns posPole. */
export function axisScoresUser(answers, byId) {
  const per = {};
  for (const [id, u] of Object.entries(answers)) {
    const q = byId[id];
    if (!q || u === null || u === undefined) continue;
    (per[q.axis] ||= []).push(u * poleSign(q));
  }
  return Object.fromEntries(Object.entries(per).map(([a, xs]) => [a, mean(xs)]));
}
export function axisScoresParty(partyPos, questions) {
  const per = {};
  for (const q of questions) {
    const pos = partyPos?.[q.id];
    if (!pos || pos.value === null || pos.value === undefined) continue;
    (per[q.axis] ||= []).push(pos.value * poleSign(q));
  }
  return Object.fromEntries(Object.entries(per).map(([a, xs]) => [a, mean(xs)]));
}

/** Kompass enligt compass.json: x = ekonomi, y = snitt av (varderingar, lag, migration). */
export function compassFromAxes(ax, compass) {
  const xAxes = compass.parties.x.axes, yAxes = compass.parties.y.axes;
  const x = mean(xAxes.map((a) => ax[a]).filter((v) => v !== undefined && v !== null));
  const y = mean(yAxes.map((a) => ax[a]).filter((v) => v !== undefined && v !== null));
  return { x, y };
}
/** Användarens punkt från värderingsfrågorna (values.json). */
export function compassFromValues(vAnswers, values) {
  const xs = [], ys = [];
  for (const v of values) {
    const u = vAnswers[v.id];
    if (u === null || u === undefined) continue;
    if (v.axis === "econ") xs.push(v.agreeDirection === "left" ? -u : u);
    if (v.axis === "auth") ys.push(v.agreeDirection === "lib" ? -u : u);
  }
  return { x: mean(xs), y: mean(ys) };
}

/** Partiets tydligaste profilfrågor: långt från de andra partiernas snitt och tydligt ställningstagande. */
export function keyIssues(partyId, questions, posIdx, k = 10) {
  const confW = { "hög": 1, "medel": 0.8, "låg": 0.5 };
  const scored = [];
  for (const q of questions) {
    if (q.type !== "statement") continue;
    const own = posIdx[partyId]?.[q.id];
    if (!own || own.value === null || own.value === undefined) continue;
    const others = PARTY_ORDER.filter((p) => p !== partyId)
      .map((p) => posIdx[p]?.[q.id]?.value).filter((v) => v !== null && v !== undefined);
    const dist = others.length ? Math.abs(own.value - mean(others)) : 0;
    scored.push({ id: q.id, s: (dist + 0.5 * Math.abs(own.value)) * (confW[own.confidence] ?? 0.5) });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.id);
}

/**
 * Frågeordning: först 10 profilfrågor för valt parti (annars de 10 första påståendena),
 * sedan resten i fast filordning med ett scenario inlagt efter var fjärde fråga.
 */
export function questionOrder(guess, questions, posIdx) {
  const stmts = questions.filter((q) => q.type === "statement");
  const scen = questions.filter((q) => q.type === "scenario");
  const first = guess && PARTY_ORDER.includes(guess)
    ? keyIssues(guess, questions, posIdx, 10)
    : stmts.slice(0, 10).map((q) => q.id);
  const rest = stmts.map((q) => q.id).filter((id) => !first.includes(id));
  const out = [...first];
  let si = 0;
  rest.forEach((id, i) => {
    out.push(id);
    if ((i + 1) % 4 === 0 && si < scen.length) out.push(scen[si++].id);
  });
  while (si < scen.length) out.push(scen[si++].id);
  return out;
}

/* ---------- Dela via URL-hash ----------
   Format: r1.<gissning>.<koder>  där koderna följer kärnfrågornas filordning och sedan värderingsfrågornas.
   '0'–'4' = svar (-2..2), 'A'–'E' = samma men "viktig för mig", 'x' = hoppade över/obesvarad. */
export function encodeResult(guess, answers, important, vAnswers, questions, values) {
  const code = (id, u, imp) => (u === null || u === undefined) ? "x" : String.fromCharCode((imp ? 65 : 48) + u + 2);
  const a = questions.map((q) => code(q.id, answers[q.id], important.has(q.id))).join("");
  const v = values.map((q) => code(q.id, vAnswers[q.id], false)).join("");
  return `r1.${guess || "x"}.${a}${v}`;
}
export function decodeResult(str, questions, values) {
  const m = /^r1\.([a-z]{1,2}|x)\.([0-4A-Ex]+)$/.exec(str || "");
  if (!m || m[2].length !== questions.length + values.length) return null;
  const answers = {}, vAnswers = {}, important = new Set();
  const dec = (c) => {
    if (c === "x") return [null, false];
    const code = c.charCodeAt(0);
    return code >= 65 ? [code - 65 - 2, true] : [code - 48 - 2, false];
  };
  questions.forEach((q, i) => { const [u, imp] = dec(m[2][i]); answers[q.id] = u; if (imp) important.add(q.id); });
  values.forEach((q, i) => { vAnswers[q.id] = dec(m[2][questions.length + i])[0]; });
  return { guess: m[1] === "x" ? null : m[1], answers, important, vAnswers };
}
