import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNlh7, evaluatePlo, equity, kuhnCfr, parseCard, parseNlhRange, parsePloRange, plo4FastExploitabilityPctPot, plo5FastExploitabilityPctPot, potLimitMaxRaise, serializeRange, solveRiverSpot } from "./index.js";

const cs = (s: string) => s.split(/\s+/).map(parseCard);

test("NLH ranks quads over full house", () => {
  assert.ok(evaluateNlh7(cs("As Ah Ac Ad Kc Qc Jc")) > evaluateNlh7(cs("Ks Kh Kc Qd Qh 2c 3d")));
});

test("PLO must use exactly two hole cards", () => {
  const board = cs("Ah Kh Qh Jh 2c");
  const oneHeart = evaluatePlo(cs("Th 9c 8d 7s"), board);
  const twoHeart = evaluatePlo(cs("Th 9h 8d 7s"), board);
  assert.ok(twoHeart > oneHeart);
  const plo5OneHeart = evaluatePlo(cs("Th 9c 8d 7s 6c"), board);
  const plo5TwoHeart = evaluatePlo(cs("Th 9h 8d 7s 6c"), board);
  assert.ok(plo5TwoHeart > plo5OneHeart);

  const quadsBoard = cs("As Ah Ad Ac Ks");
  assert.ok(evaluatePlo(cs("Kh Kd Qh Jh"), quadsBoard) > evaluatePlo(cs("Qh Jh Th 9h"), quadsBoard));
  assert.ok(evaluatePlo(cs("Kh Kd Qh Jh Th"), quadsBoard) > evaluatePlo(cs("Qh Jh Th 9h 8h"), quadsBoard));
});

test("equity AA vs KK preflop is plausible", () => {
  const [aa] = equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], [], "NLH", 20_000, 7);
  assert.ok(aa!.equity > 0.79 && aa!.equity < 0.84, aa!.equity.toString());
});

test("PLO equity validates game-specific hole counts", () => {
  const board = cs("2c 3d 4h 5s 9c");
  const rows = equity([{ cards: cs("As Ah Kc Qd Js") }, { cards: cs("Ts 9h 8d 7c 6s") }], board, "PLO5", 0, 3);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.samples, 1);
  assert.throws(() => equity([{ cards: cs("As Ah Kc Qd Js") }, { cards: cs("Ts 9h 8d 7c 6s") }], board, "PLO4"), /PLO4/);
});

test("equity excludes dead cards", () => {
  assert.throws(() => equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], [], "NLH", 10, 3, cs("As")), /duplicate/);
  const withoutDead = equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], cs("2c 3d 4h 5s"), "NLH", 0, 3)[0]!.equity;
  const withDead = equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], cs("2c 3d 4h 5s"), "NLH", 0, 3, cs("Ac"))[0]!.equity;
  assert.notEqual(withDead, withoutDead);
});

test("range parser round trips", () => {
  const parsed = parseNlhRange("AA, A5s:0.5");
  assert.equal(serializeRange(parsed), "AA, A5s:0.5");
});

test("NLH range parser expands plus and span syntax", () => {
  const parsed = parseNlhRange("AJo+, TT-77:0.25, 76s-54s");
  assert.deepEqual(parsed.map((r) => r.label), ["AJo", "AQo", "AKo", "TT", "99", "88", "77", "76s", "65s", "54s"]);
  assert.deepEqual(parsed.slice(3, 7).map((r) => r.weight), [0.25, 0.25, 0.25, 0.25]);
});

test("PLO range parser validates pattern suitedness and percent", () => {
  const parsed = parsePloRange("AA**:ds@100, AA**:ss@60, JT98:ds@75");
  assert.deepEqual(parsed.map((r) => r.label), ["AA**:ds", "AA**:ss", "JT98:ds"]);
  assert.deepEqual(parsed.map((r) => r.weight), [1, 0.6, 0.75]);
  assert.throws(() => parsePloRange("AA**:bad@50"), /suitedness/);
  assert.throws(() => parsePloRange("AA**:ds@120"), /weight/);
});

test("pot limit max raise known formula", () => {
  assert.equal(potLimitMaxRaise(100, 20), 160);
});

test("Kuhn value converges near -1/18", () => {
  assert.ok(Math.abs(kuhnCfr() + 1 / 18) < 1e-3);
});

test("TS river solve fallback emits pure best-response rows", () => {
  const result = solveRiverSpot(100, 66, 250);
  assert.equal(result.rows.length, 28);
  assert.deepEqual(result.rows.slice(0, 2).map((r) => r.combo), ["AcAd", "AcAh"]);
  assert.deepEqual(
    result.rows.map((r) => r.fold + r.call + r.raise),
    result.rows.map(() => 1)
  );
  assert.ok(result.exploitability[0]!.value >= result.exploitability.at(-1)!.value);
  assert.ok(result.exploitability.at(-1)!.value <= 0.3);
  assert.ok(result.rows[0]!.raiseEv >= result.rows[0]!.callEv);
  assert.ok(result.rows.at(-1)!.ev >= 0);
  assert.equal(result.metrics.spr, 2.5);
  assert.equal(result.metrics.brGapPctPot, result.exploitability.at(-1)!.value);
});

test("TS river solve fallback rejects invalid spots", () => {
  assert.throws(() => solveRiverSpot(0, 66), /pot/);
  assert.throws(() => solveRiverSpot(100, -1), /bet/);
  assert.throws(() => solveRiverSpot(100, 66, 0), /stack/);
  assert.throws(() => solveRiverSpot(100, 66, 250, "Ah Ah"), /duplicate/);
  assert.throws(() => solveRiverSpot(100, 66, 250, "", -1, 0), /rake/);
});

test("TS river solve fallback uses board in concrete combo equities", () => {
  const empty = solveRiverSpot(100, 66, 250);
  const boarded = solveRiverSpot(100, 66, 250, "Ah Kd 7c");
  assert.notEqual(empty.rows[0]!.equity, boarded.rows[0]!.equity);
  assert.ok(!boarded.rows.some((r) => r.combo.includes("Ah")));
});

test("TS river solve fallback subtracts capped rake from showdown EV", () => {
  const noRake = solveRiverSpot(100, 66, 250);
  const raked = solveRiverSpot(100, 66, 250, "", 5, 10);
  assert.ok(raked.rows[0]!.callEv < noRake.rows[0]!.callEv);
  assert.ok(raked.rows[0]!.raiseEv < noRake.rows[0]!.raiseEv);
});

test("TS solve fallback reports PLO Fast BR metrics", () => {
  const plo4 = solveRiverSpot(100, 66, 250, "", 0, 0, "PLO4");
  assert.equal(plo4.rows[0]!.combo, "PLO4 B1");
  assert.ok((plo4.metrics.brGapPctPot ?? -1) >= 0);
  assert.equal(plo4.metrics.ploFastExploitability, plo4FastExploitabilityPctPot());
  const plo5 = solveRiverSpot(100, 66, 250, "", 0, 0, "PLO5");
  assert.equal(plo5.rows[0]!.combo, "PLO5 B1");
  assert.ok((plo5.metrics.brGapPctPot ?? -1) >= 0);
  assert.equal(plo5.metrics.ploFastExploitability, plo5FastExploitabilityPctPot());
});
