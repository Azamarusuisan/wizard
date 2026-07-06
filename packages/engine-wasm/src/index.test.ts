import assert from "node:assert/strict";
import test from "node:test";
import { concreteBets, concretePotLimitBets, evaluateNlh7, evaluatePlo, equity, equityAuto, estimateEquityEvaluations, kuhnCfr, parseBetTree, parseCard, parseNlhRange, parsePloRange, plo4FastExploitabilityPctPot, plo5FastExploitabilityPctPot, potLimitMaxRaise, serializeRange, solveNlhComboSpot, solveRiverSpot } from "./index.js";

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
  assert.equal(rows[0]!.handDistribution.reduce((a, b) => a + b, 0), 1);
  assert.throws(() => equity([{ cards: cs("As Ah Kc Qd Js") }, { cards: cs("Ts 9h 8d 7c 6s") }], board, "PLO4"), /PLO4/);
});

test("equity reports hand category distribution", () => {
  const [row] = equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], cs("Ac Ad Kh Qs Jc"), "NLH", 0, 3);
  assert.equal(row!.handDistribution[7], 1);
});

test("equity excludes dead cards", () => {
  assert.throws(() => equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], [], "NLH", 10, 3, cs("As")), /duplicate/);
  const withoutDead = equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], cs("2c 3d 4h 5s"), "NLH", 0, 3)[0]!.equity;
  const withDead = equity([{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }], cs("2c 3d 4h 5s"), "NLH", 0, 3, cs("Ac"))[0]!.equity;
  assert.notEqual(withDead, withoutDead);
});

test("equity auto switches by evaluation estimate", () => {
  const players = [{ cards: cs("As Ah") }, { cards: cs("Kc Kd") }];
  assert.equal(estimateEquityEvaluations(players, cs("2c 3d 4h 5s"), "NLH"), 88);
  assert.equal(equityAuto(players, cs("2c 3d 4h 5s"), "NLH", 1000, 3)[0]!.samples, 44);
  assert.equal(equityAuto(players, [], "NLH", 123, 3, [], 1)[0]!.samples, 123);
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

test("bet tree parser validates street sizes", () => {
  const tree = parseBetTree("flop 33,66,all-in; turn 66,125; river 75,all-in");
  assert.deepEqual(tree.flop, [{ kind: "percent", value: 33 }, { kind: "percent", value: 66 }, { kind: "all-in" }]);
  assert.deepEqual(concreteBets(tree.flop, 100, 120), [33, 66, 120]);
  assert.deepEqual(concreteBets([{ kind: "percent", value: 90 }, { kind: "all-in" }], 100, 100), [100]);
  assert.deepEqual(concretePotLimitBets([{ kind: "percent", value: 50 }, { kind: "percent", value: 200 }, { kind: "all-in" }], 100, 20, 300), [50, 160]);
  assert.throws(() => parseBetTree("turn 66"), /flop/);
  assert.throws(() => parseBetTree("flop 0"), /bet size/);
});

test("Kuhn value converges near -1/18", () => {
  assert.ok(Math.abs(kuhnCfr() + 1 / 18) < 1e-3);
});

test("TS river solve fallback emits CFR-trained rows", () => {
  const result = solveRiverSpot(100, 66, 250, "", 0, 0, "NLH", "flop 33,66,all-in");
  assert.deepEqual(result.nodes[0], { id: "root", label: "Root", street: "preflop", actions: ["fold", "call", "raise"], infoSet: "preflop:root" });
  assert.ok(result.nodes.some((node) => node.id === "root/call"));
  assert.ok(result.nodes.some((node) => node.id === "root/bet-33"));
  assert.ok(result.nodes.some((node) => node.id === "root/bet-all-in"));
  assert.equal(result.nodes.find((node) => node.id === "root/bet-33")?.infoSet, "preflop:root/bet-33");
  assert.equal(result.informationSets.find((infoSet) => infoSet.nodeId === "root/bet-33")?.key, "preflop:root/bet-33");
  assert.equal(result.informationSets.find((infoSet) => infoSet.nodeId === "root/bet-33")?.strategyRef, "bet-response");
  assert.equal(result.informationSets.find((infoSet) => infoSet.nodeId === "root/call")?.metricRef, "action:call");
  assert.deepEqual(result.nodes.find((node) => node.id === "root/bet-33")?.actions, ["fold", "call"]);
  assert.equal(result.nodes.find((node) => node.id === "root/bet-33")?.amount, 33);
  assert.equal(result.nodes.find((node) => node.id === "root/bet-33")?.pot, 100);
  assert.equal(result.rows.length, 28);
  assert.deepEqual(result.rows.slice(0, 2).map((r) => r.combo), ["AcAd", "AcAh"]);
  assert.deepEqual(
    result.rows.map((r) => r.fold + r.call + r.raise),
    result.rows.map(() => 1)
  );
  assert.ok(result.exploitability[0]!.value >= result.exploitability.at(-1)!.value);
  assert.ok(result.exploitability.at(-1)!.value <= 0.3);
  assert.ok(result.rows[0]!.raiseEv >= result.rows[0]!.callEv);
  assert.ok(result.rows[0]!.raiseEv > solveRiverSpot(100, 66, 250).rows[0]!.raiseEv);
  assert.ok(result.rows.at(-1)!.ev >= 0);
  assert.equal(result.metrics.spr, 2.5);
  assert.equal(result.metrics.mdf, 100 / 166);
  assert.equal(result.metrics.alpha, 66 / 166);
  assert.equal(result.metrics.potOdds, 66 / 232);
  assert.equal(result.metrics.brGapPctPot, result.exploitability.at(-1)!.value);
});

test("TS river solve precision changes CFR iteration depth", () => {
  const fast = solveRiverSpot(100, 66, 250, "", 0, 0, "NLH", "", "fast");
  const precise = solveRiverSpot(100, 66, 250, "", 0, 0, "NLH", "", "precise");
  assert.notEqual(fast.rows[0]!.fold, precise.rows[0]!.fold);
});

test("TS solve nodes use bet sizes for the current board street", () => {
  const tree = "flop 33; turn 66; river 150";
  const turn = solveRiverSpot(100, 66, 250, "Ah Kd 7c 2s", 0, 0, "NLH", tree);
  assert.ok(turn.nodes.some((node) => node.id === "root/bet-66"));
  assert.ok(!turn.nodes.some((node) => node.id === "root/bet-33"));
  const river = solveRiverSpot(100, 66, 250, "Ah Kd 7c 2s 3d", 0, 0, "NLH", tree);
  assert.ok(river.nodes.some((node) => node.id === "root/bet-150"));
  assert.ok(!river.nodes.some((node) => node.id === "root/bet-66"));
});

test("TS river solve fallback rejects invalid spots", () => {
  assert.throws(() => solveRiverSpot(0, 66), /pot/);
  assert.throws(() => solveRiverSpot(100, -1), /bet/);
  assert.throws(() => solveRiverSpot(100, 66, 0), /stack/);
  assert.throws(() => solveRiverSpot(100, 66, 250, "Ah Ah"), /duplicate/);
  assert.throws(() => solveRiverSpot(100, 66, 250, "", -1, 0), /rake/);
  assert.throws(() => solveRiverSpot(100, 66, 250, "", 0, 0, "NLH", "turn 66"), /flop/);
});

test("TS river solve fallback uses board in concrete combo equities", () => {
  const empty = solveRiverSpot(100, 66, 250);
  const boarded = solveRiverSpot(100, 66, 250, "Ah Kd 7c");
  assert.equal(boarded.nodes[0]!.street, "flop");
  assert.notEqual(empty.rows[0]!.equity, boarded.rows[0]!.equity);
  assert.ok(!boarded.rows.some((r) => r.combo.includes("Ah")));
});

test("TS river solve fallback uses custom NLH ranges", () => {
  const custom = solveRiverSpot(100, 66, 250, "Ah Kd 7c", 0, 0, "NLH", "", "balanced", "QQ, JTs", "AA");
  assert.ok(custom.rows.length > 0);
  assert.ok(custom.rows.every((row) => row.combo.startsWith("Q") || row.combo.startsWith("J") || row.combo.startsWith("T")));
  assert.ok(custom.rows.some((row) => row.handClass === "pair"));
  const weighted = solveRiverSpot(100, 66, 250, "Ah Kd 7c", 0, 0, "NLH", "", "balanced", "QQ:0.25", "AA");
  assert.ok(weighted.rows.every((row) => row.weight === 0.25));
  const blockers = solveRiverSpot(100, 66, 250, "Kd 7c 2s", 0, 0, "NLH", "", "balanced", "AA", "AA");
  assert.ok(blockers.rows[0]!.blockedCombos > 0);
  assert.ok(blockers.rows[0]!.blockerPct > 0);
  const defaultVillains = solveRiverSpot(100, 66, 250, "Ah Kd 7c", 0, 0, "NLH", "", "balanced", "QQ", "");
  const aaVillains = solveRiverSpot(100, 66, 250, "Ah Kd 7c", 0, 0, "NLH", "", "balanced", "QQ", "AA");
  assert.notEqual(defaultVillains.rows[0]!.equity, aaVillains.rows[0]!.equity);
});

test("TS single NLH combo solve reports one concrete board-aware row", () => {
  const result = solveNlhComboSpot(100, 66, 250, "Ah Kd 7c", "AcAd");
  assert.equal(result.nodes[0]!.street, "flop");
  assert.deepEqual(result.rows.map((row) => row.combo), ["AcAd"]);
  assert.ok(result.rows[0]!.equity > 0.5);
  assert.throws(() => solveNlhComboSpot(100, 66, 250, "Ah Kd 7c", "AcAh"), /duplicate/);
  assert.throws(() => solveNlhComboSpot(100, 66, 250, "Ah Kd 7c", "AcA"), /bad combo/);
});

test("TS river solve fallback subtracts capped rake from showdown EV", () => {
  const noRake = solveRiverSpot(100, 66, 250);
  const raked = solveRiverSpot(100, 66, 250, "", 5, 10);
  assert.ok(raked.rows[0]!.callEv < noRake.rows[0]!.callEv);
  assert.ok(raked.rows[0]!.raiseEv < noRake.rows[0]!.raiseEv);
});

test("TS solve fallback reports PLO Fast BR metrics", () => {
  const plo4 = solveRiverSpot(100, 20, 300, "", 0, 0, "PLO4", "flop 50,200,all-in");
  assert.equal(plo4.rows[0]!.combo, "AsAhKsKh");
  assert.ok(plo4.nodes.some((node) => node.id === "root/bet-160"));
  assert.ok(!plo4.nodes.some((node) => node.id === "root/bet-300"));
  assert.ok(plo4.rows[0]!.raiseEv > solveRiverSpot(100, 20, 300, "", 0, 0, "PLO4").rows[0]!.raiseEv);
  assert.ok((plo4.metrics.brGapPctPot ?? -1) >= 0);
  assert.equal(plo4.metrics.ploFastExploitability, plo4FastExploitabilityPctPot());
  assert.equal(plo4.metrics.ploSampleCount, 6);
  assert.ok(Math.abs(plo4.metrics.ploWeightCoverage! - 1) < 1e-12);
  assert.ok(plo4.rows.every((row) => row.fold + row.call + row.raise === 1));
  const plo5 = solveRiverSpot(100, 66, 250, "", 0, 0, "PLO5");
  assert.equal(plo5.rows[0]!.combo, "AsAhKsKhQs");
  assert.ok((plo5.metrics.brGapPctPot ?? -1) >= 0);
  assert.equal(plo5.metrics.ploFastExploitability, plo5FastExploitabilityPctPot());
  assert.equal(plo5.metrics.ploSampleCount, 6);
  assert.ok(Math.abs(plo5.metrics.ploWeightCoverage! - 1) < 1e-12);
  assert.ok(plo5.rows.every((row) => row.fold + row.call + row.raise === 1));
});
