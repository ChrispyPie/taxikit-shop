import {
  SCALE, PARTY_ORDER, coreQuestions, coreValues, positionIndex, rankParties, explain,
  axisScoresUser, axisScoresParty, compassFromAxes, compassFromValues, questionOrder,
  encodeResult, decodeResult,
} from "./score.js";

// TODO: byt till Christians riktiga Ko-fi-sida när kontot finns (samma länk finns i om.html).
const KOFI_URL = "https://ko-fi.com/TODO-valkompass";
const STORE = "vk2-state-v1";
const app = document.getElementById("app");

let D; // data
let S; // state

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pName = (id) => D.partyById[id]?.name ?? id;
const pShort = (id) => D.partyById[id]?.short ?? id.toUpperCase();
const fmtPct = (x) => (x === null ? "–" : `${Math.round(x)} %`);
const fmtDate = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" }) : "datum saknas");

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}
function freshState() {
  return { v: 1, phase: "start", guess: undefined, partyOrder: shuffle(PARTY_ORDER), order: [], i: 0, answers: {}, important: [], vi: 0, vAnswers: {} };
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* privat läge: kör vidare utan sparning */ } }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.v === 1 && Array.isArray(s.order) && s.order.every((id) => D.qById[id])) return s;
  } catch { /* ignorera */ }
  return freshState();
}

async function init() {
  const get = (f) => fetch(`data/${f}.json`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  const [parties, axes, statements, values, compass, positions] = await Promise.all(
    ["parties", "axes", "statements", "values", "compass", "positions"].map(get));
  const questions = coreQuestions(statements.statements);
  D = {
    parties: parties.parties, partyById: Object.fromEntries(parties.parties.map((p) => [p.id, p])),
    axes: axes.axes, axisById: Object.fromEntries(axes.axes.map((a) => [a.id, a])),
    questions, qById: Object.fromEntries(questions.map((q) => [q.id, q])),
    values: coreValues(values.statements), compass,
    posIdx: positionIndex(positions.positions),
  };
  D.compassStatements = questions.filter((q) => q.type === "statement");
  const shared = location.hash.startsWith("#r1.") ? decodeResult(decodeURIComponent(location.hash.slice(1)), D.questions, D.values) : null;
  if (shared) return renderResult(shared, true);
  S = load();
  route();
}

function route() {
  save();
  ({ start: renderStart, guess: renderGuess, q: renderQuestion, vintro: renderValuesIntro, values: renderValue, result: () => renderResult(fromState(), false) })[S.phase]();
}
function go(phase) { S.phase = phase; route(); focusMain(); }
function focusMain() { const h = app.querySelector("h1,h2"); (h || app).setAttribute("tabindex", "-1"); (h || app).focus({ preventScroll: true }); window.scrollTo(0, 0); }
function fromState() { return { guess: S.guess, answers: S.answers, important: new Set(S.important), vAnswers: S.vAnswers }; }

/* ---------- 1. Start ---------- */
function renderStart() {
  const resume = S.order.length && S.phase === "start" && Object.keys(S.answers).length;
  app.innerHTML = `
  <section class="card">
    <h1>Ta reda på vad du själv tycker – inte vad du tror att du tycker</h1>
    <p class="lead">Vänner, flöden och kommentarsfält har massor av åsikter. Här får dina egna komma till tals.</p>
    <ul>
      <li>Du svarar på ${D.questions.length} korta frågor om politik och ${D.values.length} om värderingar.</li>
      <li>Sedan ser du hur väl du matchar alla åtta riksdagspartier – och <strong>varför</strong>, med källor.</li>
      <li>Tar ungefär 5 minuter. Ungefär lika lång tid som att leta efter fjärrkontrollen.</li>
    </ul>
    <p class="muted small">Partiernas svar bygger på deras egna program, uttalanden och hur de faktiskt röstat i riksdagen. Inga konton, inga spårare – svaren sparas bara i din webbläsare.</p>
    <div class="row">
      <button class="primary" id="go">${resume ? "Fortsätt där du var" : "Starta testet"}</button>
      ${resume ? `<button id="restart">Börja om</button>` : ""}
    </div>
  </section>`;
  app.querySelector("#go").onclick = () => go(S.order.length ? "q" : "guess");
  app.querySelector("#restart")?.addEventListener("click", () => { S = freshState(); go("guess"); });
}

/* ---------- 2. Gissning ---------- */
function renderGuess() {
  app.innerHTML = `
  <section class="card">
    <h1>Vilket parti tror du att du håller med mest?</h1>
    <p class="muted">Ingen rättning här. Vi jämför bara med ditt resultat i slutet. Partierna visas i slumpad ordning.</p>
    <div class="grid-parties" role="group" aria-label="Välj parti">
      ${S.partyOrder.map((id) => `<button data-p="${id}"><span class="short">${esc(pShort(id))}</span><span class="name">${esc(pName(id))}</span></button>`).join("")}
      <button class="wide" data-p="">Vet inte</button>
    </div>
  </section>`;
  app.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => {
    S.guess = b.dataset.p || null;
    S.order = questionOrder(S.guess, D.questions, D.posIdx);
    S.i = 0; go("q");
  }));
}

/* ---------- 3. Frågor ---------- */
function scaleLabels(q) {
  return q.type === "scenario"
    ? ["Helt enligt A", "Lutar åt A", "Mittemellan", "Lutar åt B", "Helt enligt B"]
    : SCALE;
}
function questionCard({ q, n, total, value, important, showImportant, partLabel }) {
  const labels = scaleLabels(q);
  const body = q.type === "scenario"
    ? `<p class="story">${esc(q.story)}</p><p class="qtext" id="qt">${esc(q.question)}</p>
       <ul class="plain small stack" style="margin-bottom:.8rem"><li><span class="tag">A</span>${esc(q.leftLabel)}</li><li><span class="tag">B</span>${esc(q.rightLabel)}</li></ul>`
    : `<p class="qtext" id="qt">${esc(q.text)}</p>`;
  return `
  <section class="card">
    <div class="qmeta"><span>${partLabel}</span><span>Fråga ${n} av ${total}</span></div>
    <div class="progress" role="progressbar" aria-label="Hur långt du kommit" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n - 1}"><span style="width:${((n - 1) / total) * 100}%"></span></div>
    <h2 class="sr">Fråga ${n}</h2>
    ${body}
    ${showImportant ? `<label class="toggle"><input type="checkbox" id="imp" ${important ? "checked" : ""}> Viktig för mig <span class="muted small">(räknas dubbelt)</span></label>` : ""}
    <div class="scale" role="group" aria-labelledby="qt">
      ${labels.map((l, k) => `<button data-v="${k - 2}" aria-pressed="${value === k - 2}"><span class="dot" aria-hidden="true"></span>${esc(l)}</button>`).join("")}
    </div>
    <div class="navrow">
      <button id="back">← Tillbaka</button>
      <button class="link" id="skip">Hoppa över</button>
    </div>
  </section>`;
}
function bindQuestion(onAnswer, onBack, onImportant) {
  app.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => {
    app.querySelectorAll("[data-v]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    setTimeout(() => onAnswer(Number(b.dataset.v)), 180);
  }));
  app.querySelector("#skip").onclick = () => onAnswer(null);
  app.querySelector("#back").onclick = onBack;
  app.querySelector("#imp")?.addEventListener("change", (e) => onImportant(e.target.checked));
}
function renderQuestion() {
  const id = S.order[S.i], q = D.qById[id];
  app.innerHTML = questionCard({
    q, n: S.i + 1, total: S.order.length, value: S.answers[id], important: S.important.includes(id),
    showImportant: true, partLabel: "Del 1 · Politik",
  });
  bindQuestion(
    (v) => { S.answers[id] = v; S.i++; if (S.i >= S.order.length) go("vintro"); else { route(); focusMain(); } },
    () => { if (S.i === 0) go("guess"); else { S.i--; route(); focusMain(); } },
    (on) => { S.important = on ? [...new Set([...S.important, id])] : S.important.filter((x) => x !== id); save(); },
  );
}

/* ---------- 4. Värderingar ---------- */
function renderValuesIntro() {
  app.innerHTML = `
  <section class="card">
    <h1>Del 2: Värderingstestet</h1>
    <p class="lead">${D.values.length} korta frågor om hur du ser på samhället i stort – inte om enskilda partier eller lagförslag.</p>
    <p>Svaren placerar dig i en <strong>politisk kompass</strong> (vänster–höger och frihetlig–auktoritär). De <strong>påverkar inte</strong> din partimatchning.</p>
    <div class="row">
      <button class="primary" id="go">Kör</button>
      <button id="skipall">Hoppa över och visa resultatet</button>
      <button class="link" id="back">← Tillbaka</button>
    </div>
  </section>`;
  app.querySelector("#go").onclick = () => { S.vi = 0; go("values"); };
  app.querySelector("#skipall").onclick = () => go("result");
  app.querySelector("#back").onclick = () => { S.i = S.order.length - 1; go("q"); };
}
function renderValue() {
  const q = D.values[S.vi];
  app.innerHTML = questionCard({
    q: { ...q, type: "statement" }, n: S.vi + 1, total: D.values.length, value: S.vAnswers[q.id],
    showImportant: false, partLabel: "Del 2 · Värderingar (påverkar inte matchningen)",
  });
  bindQuestion(
    (v) => { S.vAnswers[q.id] = v; S.vi++; if (S.vi >= D.values.length) go("result"); else { route(); focusMain(); } },
    () => { if (S.vi === 0) go("vintro"); else { S.vi--; route(); focusMain(); } },
    () => {},
  );
}

/* ---------- 5. Resultat ---------- */
function valueWord(v) { return SCALE[v + 2]; }
function answerWord(q, v) {
  if (q.type !== "scenario") return valueWord(v);
  return ["helt enligt A", "lutar åt A", "mittemellan", "lutar åt B", "helt enligt B"][v + 2];
}
function whyItem(r, partyId) {
  const q = r.q, pos = r.pos;
  const title = q.type === "scenario" ? q.question + " – " + q.story : q.text;
  const src = pos.url ? `<a href="${esc(pos.url)}" target="_blank" rel="noopener noreferrer">${esc(pos.sourceDetail || pos.sourceType || "Källa")}</a>` : "Källa saknas";
  return `<li>
    <strong>${esc(title)}</strong>${r.important ? ` <span class="tag">viktig för dig</span>` : ""}<br>
    <span class="small">Du: ${esc(answerWord(q, r.u))} · ${esc(pShort(partyId))}: ${esc(answerWord(q, r.p))}</span>
    ${pos.quote ? `<blockquote>”${esc(pos.quote)}”</blockquote>` : ""}
    <span class="small">${src} · ${esc(fmtDate(pos.date))} · <span class="badge ${esc(pos.confidence)}" title="Hur säker tolkningen är">säkerhet: ${esc(pos.confidence)}</span>
    ${pos.reviewedByParty === true ? ` <span class="badge rev">granskat av partiet</span>` : ""}</span>
  </li>`;
}
function compassSVG(points) {
  const W = 340, P = 30, C = W / 2, R = (W - 2 * P) / 2;
  const px = (x) => C + (x / 2) * R, py = (y) => C - (y / 2) * R; // auktoritär uppåt
  const dot = (p) => p.kind === "party"
    ? `<g><circle cx="${px(p.x)}" cy="${py(p.y)}" r="11" fill="#1d2433"/><text x="${px(p.x)}" y="${py(p.y) + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${esc(p.label)}</text></g>`
    : p.kind === "you"
      ? `<g><rect x="${px(p.x) - 8}" y="${py(p.y) - 8}" width="16" height="16" transform="rotate(45 ${px(p.x)} ${py(p.y)})" fill="#b4531a" stroke="#fff" stroke-width="1.5"/><text x="${px(p.x) + (p.x > 1.4 ? -16 : 16)}" y="${py(p.y) + 4}" text-anchor="${p.x > 1.4 ? "end" : "start"}" font-size="12" font-weight="700" fill="#b4531a" stroke="#fff" stroke-width="3" paint-order="stroke">Du</text></g>`
      : `<g><circle cx="${px(p.x)}" cy="${py(p.y)}" r="8" fill="none" stroke="#b4531a" stroke-width="3" stroke-dasharray="3 2"/></g>`;
  // Partier som hamnar nästan på samma ställe sprids ut lite så att alla syns.
  const parties = points.filter((p) => p.kind === "party").map((p) => ({ ...p }));
  const seen = [];
  for (const p of parties) {
    const cluster = seen.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.25);
    if (cluster.length) { const a = (cluster.length * 2 * Math.PI) / 3; p.x += 0.22 * Math.cos(a); p.y += 0.22 * Math.sin(a); }
    seen.push(p);
  }
  const clamp = (v) => Math.max(-2.05, Math.min(2.05, v));
  parties.forEach((p) => { p.x = clamp(p.x); p.y = clamp(p.y); });
  const desc = points.map((p) => `${p.kind === "party" ? p.label : p.kind === "you" ? "Du" : "Du (sakfrågor)"}: x ${p.x.toFixed(1)}, y ${p.y.toFixed(1)}`).join("; ");
  return `<svg class="compass" viewBox="0 0 ${W} ${W}" role="img" aria-labelledby="ct cd">
    <title id="ct">Politisk kompass</title><desc id="cd">Vågrätt: vänster (−2) till höger (+2). Lodrätt: frihetlig (−2) nertill till auktoritär (+2) upptill. ${esc(desc)}</desc>
    <rect x="${P}" y="${P}" width="${R}" height="${R}" fill="#f1eef2"/><rect x="${C}" y="${P}" width="${R}" height="${R}" fill="#eef1f3"/>
    <rect x="${P}" y="${C}" width="${R}" height="${R}" fill="#eef3ef"/><rect x="${C}" y="${C}" width="${R}" height="${R}" fill="#f4f2ec"/>
    <line x1="${P}" y1="${C}" x2="${W - P}" y2="${C}" stroke="#9aa0ad"/><line x1="${C}" y1="${P}" x2="${C}" y2="${W - P}" stroke="#9aa0ad"/>
    <g font-size="10" fill="#566074">
      <text x="${P + 4}" y="${P + 13}">Vänster · auktoritär</text><text x="${W - P - 4}" y="${P + 13}" text-anchor="end">Höger · auktoritär</text>
      <text x="${P + 4}" y="${W - P - 6}">Vänster · frihetlig</text><text x="${W - P - 4}" y="${W - P - 6}" text-anchor="end">Höger · frihetlig</text>
      <text x="${C}" y="${P - 8}" text-anchor="middle">Auktoritär</text><text x="${C}" y="${W - P + 18}" text-anchor="middle">Frihetlig</text>
      <text x="${P - 4}" y="${C - 6}" text-anchor="start">Vänster</text><text x="${W - P + 4}" y="${C - 6}" text-anchor="end">Höger</text>
    </g>
    ${parties.map(dot).join("")}
    ${points.filter((p) => p.kind !== "party").map(dot).join("")}
  </svg>`;
}
function axisRows(userAx, partyAx, partyId) {
  const pc = (v) => `${4 + ((v + 2) / 4) * 92}%`;
  return D.axes.map((a) => {
    const u = userAx[a.id], p = partyAx[a.id];
    return `<div class="axis"><div><strong>${esc(a.name)}</strong></div>
      <div class="lbl"><span>${esc(a.negPole)}</span><span>${esc(a.posPole)}</span></div>
      <div class="track" role="img" aria-label="${esc(a.name)}: du ${u == null ? "inget svar" : u.toFixed(1)}, ${esc(pShort(partyId))} ${p == null ? "saknas" : p.toFixed(1)} på en skala från −2 till +2">
        ${p != null ? `<span class="mk party" style="left:${pc(p)}">${esc(pShort(partyId))}</span>` : ""}
        ${u != null ? `<span class="mk you" style="left:${pc(u)}">Du</span>` : ""}
      </div></div>`;
  }).join("");
}

function renderResult(R, shared) {
  const answered = Object.values(R.answers).filter((v) => v !== null && v !== undefined).length;
  const ranking = rankParties(R.answers, D.posIdx, R.important);
  const top = ranking[0];
  const guessRank = R.guess ? ranking.findIndex((r) => r.id === R.guess) + 1 : 0;
  const guessRow = ranking.find((r) => r.id === R.guess);
  let callout;
  if (!answered) callout = `<p>Du hoppade över alla politiska frågor, så det finns inget att matcha. Modigt, men lite tunt underlag.</p>`;
  else if (!R.guess) callout = `<p>Du visste inte på förhand – nu vet du lite mer: du matchar mest med <strong>${esc(pName(top.id))}</strong> (${fmtPct(top.pct)}).</p>`;
  else if (R.guess === top.id) callout = `<p>Du trodde <strong>${esc(pShort(R.guess))}</strong> – och det stämmer. Du matchar mest med <strong>${esc(pName(top.id))}</strong> (${fmtPct(top.pct)}). Din magkänsla gör sitt jobb.</p>`;
  else callout = `<p>Du trodde <strong>${esc(pShort(R.guess))}</strong>, men du matchar mest med <strong>${esc(pShort(top.id))}</strong> (${esc(pName(top.id))}, ${fmtPct(top.pct)}). ${esc(pShort(R.guess))} hamnar på plats ${guessRank} av 8 (${fmtPct(guessRow?.pct ?? null)}).</p>`;

  const userAx = axisScoresUser(R.answers, D.qById);
  const topAx = axisScoresParty(D.posIdx[top.id], D.compassStatements);
  const points = PARTY_ORDER.map((id) => ({ kind: "party", label: pShort(id), ...compassFromAxes(axisScoresParty(D.posIdx[id], D.compassStatements), D.compass) }))
    .filter((p) => p.x != null && p.y != null);
  const vPt = compassFromValues(R.vAnswers, D.values);
  if (vPt.x != null && vPt.y != null) points.push({ kind: "you", ...vPt });
  const sPt = compassFromAxes(userAx, D.compass);
  if (sPt.x != null && sPt.y != null) points.push({ kind: "youPol", ...sPt });

  const rows = ranking.map((r) => {
    const ex = explain(R.answers, D.posIdx[r.id], R.important, D.qById);
    return `<div class="result-row${r.id === R.guess ? " guess" : ""}">
      <div class="result-head"><span><strong>${esc(pName(r.id))}</strong> <span class="muted">(${esc(pShort(r.id))})</span>${r.id === R.guess ? ` <span class="tag">din gissning</span>` : ""}</span><span class="pct">${fmtPct(r.pct)}</span></div>
      <div class="bar" aria-hidden="true"><span style="width:${r.pct ?? 0}%"></span></div>
      <div class="small muted">Jämfört på ${r.compared} frågor${r.missing ? ` · ${esc(pShort(r.id))} tog inte ställning i ${r.missing} av dina frågor (räknas inte)` : ""}</div>
      <details><summary>Varför?</summary><div class="why">
        <h3>Ni håller med varandra om</h3>${ex.agree.length ? `<ul>${ex.agree.map((x) => whyItem(x, r.id)).join("")}</ul>` : `<p class="muted small">Inga tydliga likheter.</p>`}
        <h3>Ni tycker olika om</h3>${ex.disagree.length ? `<ul>${ex.disagree.map((x) => whyItem(x, r.id)).join("")}</ul>` : `<p class="muted small">Inga stora skillnader. Mysigt.</p>`}
      </div></details>
    </div>`;
  }).join("");

  const hash = encodeResult(R.guess, R.answers, R.important, R.vAnswers, D.questions, D.values);
  const shareUrl = `${location.origin}${location.pathname}#${hash}`;

  app.innerHTML = `
  ${shared ? `<div class="card"><p><strong>Det här är någon annans delade resultat.</strong> Nyfiken på ditt eget?</p><button class="primary" id="mine">Gör testet själv</button></div>` : ""}
  <section class="card">
    <h1>${shared ? "Delat resultat" : "Ditt resultat"}</h1>
    <div class="callout">${callout}</div>
    ${answered && answered < 8 ? `<p class="small muted">Du svarade bara på ${answered} frågor, så ta resultatet med en nypa salt.</p>` : ""}
    <h2>Så väl matchar du partierna</h2>
    <p class="small muted">100 % = ni svarar exakt lika på allt. Frågor du hoppat över och frågor där ett parti saknar källa räknas inte. "Viktig för mig" räknas dubbelt.</p>
    ${rows}
  </section>
  <section class="card">
    <h2>Politisk kompass</h2>
    <p class="small muted">◆ <strong>Du</strong> = dina svar i värderingstestet. ◯ (streckad ring) = du räknat på dina politiska svar, på samma sätt som partierna. Partierna placeras utifrån sina källbelagda ståndpunkter. Kompassen påverkar inte matchningen.</p>
    ${compassSVG(points)}
    ${vPt.x == null ? `<p class="legend">Du hoppade över värderingstestet, så bara din sakfrågepunkt visas.</p>` : ""}
    <p class="legend">Obs: att stramare migration räknas som "auktoritärt" är en förenkling. Läs mer under <a href="om.html#kompass">Om testet</a>.</p>
  </section>
  <section class="card">
    <h2>Du och ${esc(pName(top.id))}, axel för axel</h2>
    <p class="small muted">Ditt snitt per område jämfört med partiet du matchar bäst, från −2 till +2. Polerna beskriver riktning, inte rätt eller fel.</p>
    ${axisRows(userAx, topAx, top.id)}
  </section>
  <section class="card stack">
    <h2>Dela och stöd</h2>
    <div class="row"><button class="primary" id="share">Dela resultatet</button>${shared ? "" : `<button id="redo">Gör om testet</button>`}</div>
    <p id="sharemsg" class="small muted" role="status"></p>
    <div class="kofi">
      <p><strong>Gillar du att det finns en neutral valkompass utan reklam?</strong> Bjud gärna på en kaffe så kan vi fortsätta hålla källorna uppdaterade.</p>
      <a class="btn" href="${KOFI_URL}" target="_blank" rel="noopener noreferrer">☕ Stöd via Ko-fi</a>
      <p class="small muted">Testlänk – Ko-fi-kontot är inte skapat än (TODO).</p>
    </div>
    <p class="small"><a href="om.html">Hur räknas det här? Läs om metoden och källorna.</a></p>
  </section>`;

  app.querySelector("#mine")?.addEventListener("click", () => { history.replaceState(null, "", location.pathname); S = load(); if (S.phase === "result") S = freshState(); go("start"); });
  app.querySelector("#redo")?.addEventListener("click", () => { if (confirm("Börja om från början? Dina svar raderas.")) { S = freshState(); go("start"); } });
  app.querySelector("#share").onclick = async () => {
    const msg = app.querySelector("#sharemsg");
    const text = `Jag matchade mest med ${pName(top.id)} i Valkompass 2.0. Vad tycker du egentligen?`;
    if (navigator.share) { try { await navigator.share({ title: "Valkompass 2.0", text, url: shareUrl }); return; } catch { /* avbrutet */ } }
    try { await navigator.clipboard.writeText(shareUrl); msg.textContent = "Länken är kopierad. Klistra in den var du vill."; }
    catch { msg.innerHTML = `Kopiera länken: <input value="${esc(shareUrl)}" readonly style="width:100%" aria-label="Länk till ditt resultat" onfocus="this.select()">`; }
  };
  if (!shared) focusMain();
}

init().catch((e) => {
  app.innerHTML = `<section class="card"><h1>Hoppsan</h1><p>Frågorna kunde inte laddas. Prova att ladda om sidan.</p><p class="small muted">${esc(e.message)}</p></section>`;
});
