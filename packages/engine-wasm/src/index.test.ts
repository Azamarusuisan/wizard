import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RIVER_SPECS, evaluateNlh7, evaluatePlo, equity, kuhnCfr, parseCard, parseNlhRange, potLimitMaxRaise, serializeRange, solveRiverSpot } from "./index.js";

const cs = (s: string) => s.split(/\s+/).map(parseCard);

test("NLH ranks quads over full house", () => {
  assert.ok(evaluateNlh7(cs("As Ah Ac Ad Kc Qc Jc")) > evaluateNlh7(cs("Ks Kh Kc Qd Qh 2c 3d")));
});

test("PLO must use exactly two hole cards", () => {
  const board = cs("Ah Kh Qh Jh 2c");
  const oneHeart = evaluatePlo(cs("Th 9c 8d 7s"), board);
  const twoHeart = evaluatePlo(cs("Th 9h 8d 7s"), board);
  assert.ok(twoHeart > oneHeart);
});

test("equity AA vs KK preflop is plausible", () => {
  const [aa] = equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], [], "NLH", 20_000, 7);
  assert.ok(aa!.equity > 0.79 && aa!.equity < 0.84, aa!.equity.toString());
});

test("range parser round trips", () => {
  const parsed = parseNlhRange("AA, A5s:0.5");
  assert.equal(serializeRange(parsed), "AA, A5s:0.5");
});

test("pot limit max raise known formula", () => {
  assert.equal(potLimitMaxRaise(100, 20), 160);
});

test("Kuhn value converges near -1/18", () => {
  assert.ok(Math.abs(kuhnCfr() + 1 / 18) < 1e-3);
});

test("TS river solve fallback emits pure best-response rows", () => {
  const result = solveRiverSpot(100, 66, 250);
  assert.deepEqual(result.rows.map((r) => r.combo), DEFAULT_RIVER_SPECS.map(([combo]) => combo));
  assert.deepEqual(
    result.rows.map((r) => r.fold + r.call + r.raise),
    result.rows.map(() => 1)
  );
  assert.equal(result.exploitability.at(-1)?.value, 0);
  assert.equal(result.metrics.spr, 2.5);
});

test("TS river solve fallback rejects invalid spots", () => {
  assert.throws(() => solveRiverSpot(0, 66), /pot/);
  assert.throws(() => solveRiverSpot(100, -1), /bet/);
  assert.throws(() => solveRiverSpot(100, 66, 0), /stack/);
});
