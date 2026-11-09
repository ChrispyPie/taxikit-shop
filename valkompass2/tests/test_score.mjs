// Kör: node valkompass2/tests/test_score.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as V from "../js/score.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const J = (f) => JSON.parse(readFileSync(path.join(dir, f + ".json"), "utf8"));
const questions = V.coreQuestions(J("statements").statements);
const values = V.coreValues(J("values").statements);
const posIdx = V.positionIndex(J("positions").positions);
const P = V.PARTY_ORDER;
let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log("FEL:", msg); } };

console.log(`Kärnfrågor: ${questions.length} (${questions.filter(q => q.type === "statement").length} påståenden, ${questions.filter(q => q.type === "scenario").length} scenarier), värderingsfrågor: ${values.length}`);

// 1. Varje parti som svarar med sina egna positioner: 100 % och plats 1.
console.log("\n1) Partierna svarar själva");
for (const p of P) {
  const answers = {};
  for (const q of questions) { const v = posIdx[p]?.[q.id]?.value; answers[q.id] = v ?? null; }
  const r = V.rankParties(answers, posIdx, new Set());
  const self = r.find(x => x.id === p);
  console.log(`  ${p.toUpperCase().padEnd(3)} ${self.pct.toFixed(1)} %  plats ${r.indexOf(self) + 1}  (tvåa: ${r[1].id.toUpperCase()} ${r[1].pct.toFixed(1)} %)`);
  ok(Math.abs(self.pct - 100) < 1e-9, `${p} får inte 100 %`);
  ok(r[0].id === p, `${p} hamnar inte först`);
  // samma sak med "viktig" på alla frågor
  const r2 = V.rankParties(answers, posIdx, new Set(questions.map(q => q.id)));
  ok(r2[0].id === p && Math.abs(r2[0].pct - 100) < 1e-9, `${p} med viktig-flagga`);
}

// 2. Slumpade användare: ingen ska vara systematiskt gynnad.
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function simulate(name, N, gen) {
  const sum = Object.fromEntries(P.map(p => [p, 0])), wins = Object.fromEntries(P.map(p => [p, 0]));
  for (let i = 0; i < N; i++) {
    const { answers, important } = gen();
    const r = V.rankParties(answers, posIdx, important);
    for (const x of r) sum[x.id] += x.pct;
    // delad förstaplats fördelas lika
    const best = r.filter(x => Math.abs(x.pct - r[0].pct) < 1e-9);
    for (const b of best) wins[b.id] += 1 / best.length;
  }
  console.log(`\n${name} (N=${N})`);
  console.log("  parti  snitt-match  andel etta");
  for (const p of P) console.log(`  ${p.toUpperCase().padEnd(5)}  ${(sum[p] / N).toFixed(1).padStart(6)} %    ${(100 * wins[p] / N).toFixed(1).padStart(5)} %`);
  const means = P.map(p => sum[p] / N);
  console.log(`  spridning i snitt: ${(Math.max(...means) - Math.min(...means)).toFixed(1)} procentenheter`);
  return { means, wins };
}
const R = rng(42), N = 10000;
const pick = () => Math.floor(R() * 5) - 2;
const a = simulate("2a) Slumpsvar, jämn fördelning −2..+2, inga hoppade", N, () => {
  const answers = {}; for (const q of questions) answers[q.id] = pick(); return { answers, important: new Set() };
});
const b = simulate("2b) Slumpsvar med 15 % överhoppade och 20 % 'viktig'", N, () => {
  const answers = {}, important = new Set();
  for (const q of questions) { answers[q.id] = R() < 0.15 ? null : pick(); if (R() < 0.2) important.add(q.id); }
  return { answers, important };
});
const c = simulate("2c) Slumpsvar bara på ytterlägen (±2), som en 'tvärsäker' användare", N, () => {
  const answers = {}; for (const q of questions) answers[q.id] = R() < 0.5 ? -2 : 2; return { answers, important: new Set() };
});
for (const res of [a, b, c]) {
  ok(Math.max(...res.means) - Math.min(...res.means) < 10, "snittmatchningen skiljer mer än 10 procentenheter mellan partier");
}

// 3. Delningslänken: kodning och avkodning ger samma resultat.
const ans = {}, imp = new Set(), vAns = {};
questions.forEach((q, i) => { ans[q.id] = i % 7 === 0 ? null : (i % 5) - 2; if (i % 4 === 0) imp.add(q.id); });
values.forEach((q, i) => { vAns[q.id] = i % 3 === 0 ? null : (i % 5) - 2; });
const enc = V.encodeResult("kd", ans, imp, vAns, questions, values);
const dec = V.decodeResult(enc, questions, values);
ok(dec && dec.guess === "kd", "delning: gissning");
ok(dec && questions.every(q => dec.answers[q.id] === ans[q.id] && dec.important.has(q.id) === (imp.has(q.id) && ans[q.id] !== null)), "delning: svar/viktig");
ok(dec && values.every(q => dec.vAnswers[q.id] === vAns[q.id]), "delning: värderingar");
ok(V.decodeResult("r1.m.123", questions, values) === null, "delning: fel längd ska avvisas");
console.log(`\n3) Delningslänk: ${enc.length} tecken, t.ex. #${enc}`);

// 4. Frågeordning: alla kärnfrågor exakt en gång, 10 profilfrågor först.
for (const g of [...P, null]) {
  const o = V.questionOrder(g, questions, posIdx);
  ok(o.length === questions.length && new Set(o).size === o.length, `ordning ${g}: fel antal/dubbletter`);
}
console.log("\n4) Profilfrågor först per parti:");
for (const p of P) console.log(`  ${p.toUpperCase().padEnd(3)} ${V.keyIssues(p, questions, posIdx).join(" ")}`);

// 5. Kompass: partiernas placering
console.log("\n5) Kompassplacering (x vänster−/höger+, y frihetlig−/auktoritär+):");
const compass = J("compass"), stm = questions.filter(q => q.type === "statement");
for (const p of P) { const pt = V.compassFromAxes(V.axisScoresParty(posIdx[p], stm), compass); console.log(`  ${p.toUpperCase().padEnd(3)} x ${pt.x.toFixed(2).padStart(5)}  y ${pt.y.toFixed(2).padStart(5)}`); }

console.log(fail ? `\n${fail} FEL` : "\nALLA TESTER OK");
process.exit(fail ? 1 : 0);
