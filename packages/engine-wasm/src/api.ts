import { concreteBets, concretePotLimitBets, nlhChanceEquity, parseBetTree, solveRiverSpot, type SolveInfoSet, type SolveNode, type SolveResult, type SolverRow } from "./index.js";

export type Progress = { iteration: number; exploitabilityPct: number; elapsed: number };
export type EngineHandle = number;
export type StrategyTable = { combos: string[]; actions: Float64Array };
export type HandMetrics = { ev: Float32Array; equity: Float32Array; eqr: Float32Array };

export interface EngineAPI {
  init(threads?: number): Promise<void>;
  backend(): Promise<"wasm" | "local">;
  solve(spotJson: string): Promise<EngineHandle>;
  pollProgress(handle: EngineHandle): Promise<Progress>;
  getStrategy(handle: EngineHandle, nodeId: string): Promise<StrategyTable>;
  getHandMetrics(handle: EngineHandle, nodeId: string): Promise<HandMetrics>;
  cancel(handle: EngineHandle): Promise<void>;
  serialize(handle: EngineHandle): Promise<Uint8Array>;
  result(handle: EngineHandle): Promise<SolveResult>;
}

const FALLBACK_COMBOS = ["AA", "AKs", "QQ", "JTs", "76s", "A5s"];

type WasmModule = {
  default: (input?: { module_or_path: URL | Uint8Array }) => Promise<unknown>;
  init: (threads?: number | null) => void;
  solve: (spotJson: string) => number;
  poll_progress: (handle: number) => string;
  get_strategy: (handle: number, nodeId: string) => Float64Array;
  get_hand_metrics: (handle: number, nodeId: string) => Float64Array;
  cancel: (handle: number) => void;
  serialize: (handle: number) => Uint8Array;
};

type NativeSolve = {
  spot?: { bet?: number };
  nodes?: SolveNode[];
  information_sets?: SolveInfoSet[];
  combos: string[];
  hand_classes?: string[];
  progress: { iter: number; exploitability_pct: number; elapsed: number }[];
  strategy: number[];
  action_evs?: number[];
  best_raise_amounts?: number[];
  metrics: number[];
  weights?: number[];
  blocker_metrics?: number[];
};
type LocalSpot = { game?: "NLH" | "PLO4" | "PLO5"; pot: number; bet: number; stack?: number; board?: string; rakePct?: number; rakeCap?: number; betTree?: string; precision?: "fast" | "balanced" | "precise"; heroRange?: string; villainRange?: string };

class LocalEngine implements EngineAPI {
  private nextHandle = 1;
  private solves = new Map<EngineHandle, { result: SolveResult; spot: LocalSpot }>();

  async init(_threads?: number): Promise<void> {
    await Promise.resolve();
  }

  async backend(): Promise<"wasm" | "local"> {
    return "local";
  }

  async solve(spotJson: string): Promise<EngineHandle> {
    const spot = JSON.parse(spotJson) as LocalSpot;
    const handle = this.nextHandle++;
    this.solves.set(handle, { result: solveRiverSpot(spot.pot, spot.bet, spot.stack, spot.board, spot.rakePct, spot.rakeCap, spot.game, spot.betTree, spot.precision, spot.heroRange, spot.villainRange), spot });
    return handle;
  }

  async pollProgress(handle: EngineHandle): Promise<Progress> {
    const result = this.mustGet(handle);
    const last = result.exploitability.at(-1)!;
    return { iteration: last.iteration, exploitabilityPct: last.value, elapsed: 0 };
  }

  async getStrategy(handle: EngineHandle, nodeId = "root"): Promise<StrategyTable> {
    const { result, spot } = this.mustGetSolve(handle);
    const node = nodeForId(result, nodeId);
    if (!node.actions.length) return { combos: [], actions: new Float64Array() };
    if (node.amount !== undefined && node.pot !== undefined) {
      const [fold, call] = betResponseStrategy(node.pot, node.amount);
      return { combos: result.rows.map((r) => r.combo), actions: Float64Array.from(result.rows.flatMap(() => [fold, call])) };
    }
    if (isChanceNode(node)) {
      const rows = chanceRows(result, spot, node);
      return { combos: rows.map((r) => r.combo), actions: Float64Array.from(rows.flatMap((r) => [r.fold, r.call, r.raise])) };
    }
    if (node.id === "root/raise-sizes") return {
      combos: result.rows.map((r) => r.combo),
      actions: Float64Array.from(result.rows.flatMap((row) => raiseSizeActions(row, node.actions, spot)))
    };
    return {
      combos: result.rows.map((r: SolverRow) => r.combo),
      actions: Float64Array.from(result.rows.flatMap((r: SolverRow) => [r.fold, r.call, r.raise]))
    };
  }

  async getHandMetrics(handle: EngineHandle, nodeId = "root"): Promise<HandMetrics> {
    const { result, spot } = this.mustGetSolve(handle);
    const node = nodeForId(result, nodeId);
    if (node.amount !== undefined && node.pot !== undefined) {
      const parent = chanceParentNode(node);
      const metricResult = parent ? { ...result, rows: chanceRows(result, spot, parent) } : result;
      if (!node.actions.length) return betResponseActionMetrics(metricResult, node.pot, node.amount, node.id.endsWith("/call"), spot);
      return betResponseMetrics(metricResult, node.pot, node.amount, spot);
    }
    if (isChanceNode(node)) {
      const rows = chanceRows(result, spot, node);
      return {
        ev: Float32Array.from(rows.map((r) => r.ev)),
        equity: Float32Array.from(rows.map((r) => r.equity)),
        eqr: Float32Array.from(rows.map((r) => r.eqr))
      };
    }
    if (node.id === "root/raise-sizes") return raiseSizeMetrics(result, node.actions, spot);
    const action = nodeActionKey(node.id);
    if (action) return actionNodeMetrics(result, action);
    if (!node.actions.length) return { ev: new Float32Array(), equity: new Float32Array(), eqr: new Float32Array() };
    return {
      ev: Float32Array.from(result.rows.map((r: SolverRow) => r.ev)),
      equity: Float32Array.from(result.rows.map((r: SolverRow) => r.equity)),
      eqr: Float32Array.from(result.rows.map((r: SolverRow) => r.eqr))
    };
  }

  async cancel(handle: EngineHandle): Promise<void> {
    this.solves.delete(handle);
  }

  async serialize(handle: EngineHandle): Promise<Uint8Array> {
    return new TextEncoder().encode(JSON.stringify(this.mustGet(handle)));
  }

  async result(handle: EngineHandle): Promise<SolveResult> {
    return this.mustGet(handle);
  }

  private mustGet(handle: EngineHandle): SolveResult {
    return this.mustGetSolve(handle).result;
  }

  private mustGetSolve(handle: EngineHandle): { result: SolveResult; spot: LocalSpot } {
    const solve = this.solves.get(handle);
    if (!solve) throw new Error(`unknown solve handle ${handle}`);
    return solve;
  }
}

function nodeForId(result: SolveResult, nodeId: string): SolveNode {
  const node = result.nodes.find((node) => node.id === nodeId || node.infoSet === nodeId);
  if (!node) throw new Error("unknown node id");
  return node;
}

function betResponseStrategy(pot: number, amount: number): [number, number] {
  return [amount / (pot + amount), pot / (pot + amount)];
}

function raiseSizeActions(row: SolverRow, actions: string[], spot: LocalSpot): number[] {
  const stack = spot.stack ?? spot.pot * 4.2;
  const evs = actions.map((action) => actionEvs(row.equity, spot.pot, raiseActionAmount(action, stack), spot.rakePct ?? 0, spot.rakeCap ?? 0).raiseEv);
  const mix = cfrAverageStrategy(evs, 256);
  return mix.map((frequency) => frequency * row.raise);
}

function raiseSizeMetrics(result: SolveResult, actions: string[], spot: LocalSpot): HandMetrics {
  const ev = Float32Array.from(result.rows.map((row) => raiseSizeEv(row, actions, spot)));
  const equity = Float32Array.from(result.rows.map((row) => row.equity));
  const eqr = Float32Array.from(result.rows.map((row, i) => ev[i]! / Math.max(0.0001, row.equity * spot.pot / 100)));
  return { ev, equity, eqr };
}

function raiseSizeEv(row: SolverRow, actions: string[], spot: LocalSpot): number {
  const stack = spot.stack ?? spot.pot * 4.2;
  const evs = actions.map((action) => actionEvs(row.equity, spot.pot, raiseActionAmount(action, stack), spot.rakePct ?? 0, spot.rakeCap ?? 0).raiseEv);
  const mix = cfrAverageStrategy(evs, 256);
  return mix.reduce((sum, frequency, i) => sum + frequency * row.raise * (evs[i] ?? 0), 0) / 100;
}

function raiseActionAmount(action: string, stack: number): number {
  return action === "all-in" ? stack : Number(action);
}

function cfrAverageStrategy(utils: number[], iterations: number): number[] {
  const regrets = Array.from({ length: utils.length }, () => 0);
  const strategySum = Array.from({ length: utils.length }, () => 0);
  for (let iter = 0; iter < iterations; iter++) {
    const strategy = regretMatching(regrets);
    const nodeEv = strategy.reduce((sum, value, i) => sum + value * (utils[i] ?? 0), 0);
    for (let i = 0; i < utils.length; i++) {
      regrets[i] += (utils[i] ?? 0) - nodeEv;
      strategySum[i] += strategy[i] ?? 0;
    }
  }
  const total = strategySum.reduce((sum, value) => sum + value, 0);
  return total > 0 ? strategySum.map((value) => value / total) : strategySum;
}

function regretMatching(regrets: number[]): number[] {
  const positives = regrets.map((value) => Math.max(0, value));
  const total = positives.reduce((sum, value) => sum + value, 0);
  return total > 0 ? positives.map((value) => value / total) : positives.map(() => 1 / positives.length);
}

function actionEvs(equityValue: number, pot: number, bet: number, rakePct: number, rakeCap: number): { raiseEv: number } {
  const winPot = pot + bet - Math.min((pot + bet) * (rakePct / 100), rakeCap);
  const callEv = equityValue * winPot - (1 - equityValue) * bet;
  const foldResponse = bet / (pot + bet);
  const callResponse = pot / (pot + bet);
  return { raiseEv: foldResponse * pot + callResponse * callEv };
}

function nodeActionKey(nodeId: string): "foldEv" | "callEv" | "raiseEv" | null {
  if (nodeId === "root/fold") return "foldEv";
  if (nodeId === "root/call") return "callEv";
  if (nodeId === "root/raise") return "raiseEv";
  return null;
}

function actionNodeMetrics(result: SolveResult, action: "foldEv" | "callEv" | "raiseEv"): HandMetrics {
  const ev = Float32Array.from(result.rows.map((row) => row[action]));
  const equity = Float32Array.from(result.rows.map((row) => row.equity));
  const eqr = Float32Array.from(result.rows.map((row, i) => {
    const rootDenominator = row.eqr === 0 ? row.equity : row.ev / row.eqr;
    return ev[i]! / Math.max(0.0001, rootDenominator);
  }));
  return { ev, equity, eqr };
}

function betResponseMetrics(result: SolveResult, pot: number, amount: number, spot: LocalSpot): HandMetrics {
  const [foldFreq, callFreq] = betResponseStrategy(pot, amount);
  const ev = Float32Array.from(result.rows.map((row) => {
    const rake = Math.min((pot + amount) * ((spot.rakePct ?? 0) / 100), spot.rakeCap ?? 0);
    const callEv = row.equity * (pot + amount - rake) - (1 - row.equity) * amount;
    return (foldFreq * pot + callFreq * callEv) / 100;
  }));
  const equity = Float32Array.from(result.rows.map((row) => row.equity));
  const eqr = Float32Array.from(result.rows.map((row, i) => ev[i]! / Math.max(0.0001, row.equity * pot / 100)));
  return { ev, equity, eqr };
}

function betResponseActionMetrics(result: SolveResult, pot: number, amount: number, callBranch: boolean, spot: LocalSpot): HandMetrics {
  const ev = Float32Array.from(result.rows.map((row) => {
    const rake = Math.min((pot + amount) * ((spot.rakePct ?? 0) / 100), spot.rakeCap ?? 0);
    return callBranch ? (row.equity * (pot + amount - rake) - (1 - row.equity) * amount) / 100 : pot / 100;
  }));
  const equity = Float32Array.from(result.rows.map((row) => row.equity));
  const eqr = Float32Array.from(result.rows.map((row, i) => ev[i]! / Math.max(0.0001, row.equity * pot / 100)));
  return { ev, equity, eqr };
}

class WasmPreferredEngine implements EngineAPI {
  private readonly local = new LocalEngine();
  private module: Promise<WasmModule | null> | null = null;

  async init(threads?: number): Promise<void> {
    const wasm = await this.loadWasm();
    if (wasm) {
      await wasm.default({ module_or_path: await wasmInitInput() });
      wasm.init(threads ?? null);
      return;
    }
    await this.local.init(threads);
  }

  async backend(): Promise<"wasm" | "local"> {
    return (await this.loadWasm()) ? "wasm" : "local";
  }

  async solve(spotJson: string): Promise<EngineHandle> {
    const wasm = await this.loadWasm();
    return wasm ? wasm.solve(spotJson) : await this.local.solve(spotJson);
  }

  async pollProgress(handle: EngineHandle): Promise<Progress> {
    const wasm = await this.loadWasm();
    if (!wasm) return await this.local.pollProgress(handle);
    const progress = JSON.parse(wasm.poll_progress(handle)) as { iter: number; exploitability_pct: number; elapsed: number };
    return { iteration: progress.iter, exploitabilityPct: progress.exploitability_pct, elapsed: progress.elapsed };
  }

  async getStrategy(handle: EngineHandle, nodeId: string): Promise<StrategyTable> {
    const wasm = await this.loadWasm();
    if (!wasm) return await this.local.getStrategy(handle, nodeId);
    const native = JSON.parse(new TextDecoder().decode(wasm.serialize(handle))) as NativeSolve;
    const actions = wasm.get_strategy(handle, nodeId);
    return { combos: actions.length ? native.combos : [], actions };
  }

  async getHandMetrics(handle: EngineHandle, nodeId: string): Promise<HandMetrics> {
    const wasm = await this.loadWasm();
    if (!wasm) return await this.local.getHandMetrics(handle, nodeId);
    const raw = wasm.get_hand_metrics(handle, nodeId);
    if (!raw.length) return { ev: new Float32Array(), equity: new Float32Array(), eqr: new Float32Array() };
    const native = JSON.parse(new TextDecoder().decode(wasm.serialize(handle))) as NativeSolve;
    return splitMetrics(raw, native.combos.length || FALLBACK_COMBOS.length);
  }

  async cancel(handle: EngineHandle): Promise<void> {
    const wasm = await this.loadWasm();
    if (wasm) wasm.cancel(handle);
    else await this.local.cancel(handle);
  }

  async serialize(handle: EngineHandle): Promise<Uint8Array> {
    const wasm = await this.loadWasm();
    return wasm ? wasm.serialize(handle) : await this.local.serialize(handle);
  }

  async result(handle: EngineHandle): Promise<SolveResult> {
    const wasm = await this.loadWasm();
    if (!wasm) return await this.local.result(handle);
    const native = JSON.parse(new TextDecoder().decode(wasm.serialize(handle))) as NativeSolve;
    return nativeToResult(native);
  }

  private loadWasm(): Promise<WasmModule | null> {
    this.module ??= import(/* @vite-ignore */ "../pkg/gto_lab_engine.js")
      .then((mod) => mod as WasmModule)
      .catch(() => null);
    return this.module;
  }
}

async function wasmInitInput(): Promise<URL | Uint8Array> {
  const url = new URL("../pkg/gto_lab_engine_bg.wasm", import.meta.url);
  if (url.protocol !== "file:") return url;
  const nodeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{ readFile: (path: URL) => Promise<Uint8Array> }>;
  const { readFile } = await nodeImport("node:fs/promises");
  return await readFile(url);
}

function splitMetrics(raw: ArrayLike<number>, rows: number): HandMetrics {
  const ev = new Float32Array(rows);
  const equity = new Float32Array(rows);
  const eqr = new Float32Array(rows);
  for (let i = 0; i < rows; i++) {
    ev[i] = raw[i * 3] ?? 0;
    equity[i] = raw[i * 3 + 1] ?? 0;
    eqr[i] = raw[i * 3 + 2] ?? 0;
  }
  return { ev, equity, eqr };
}

function nativeToResult(native: NativeSolve): SolveResult {
  const combos = native.combos.length ? native.combos : FALLBACK_COMBOS;
  const metrics = splitMetrics(native.metrics, combos.length);
  const nodes = native.nodes?.length ? native.nodes : [{ id: "root", label: "Root", street: "preflop", actions: ["fold", "call", "raise"], infoSet: "preflop:root" }];
  return {
    nodes,
    informationSets: native.information_sets?.length ? native.information_sets : infoSetsFromNodes(nodes),
    rows: combos.map((combo, i) => ({
      combo,
      weight: native.weights?.[i] ?? 1,
      handClass: native.hand_classes?.[i] ?? "unknown",
      blockedCombos: native.blocker_metrics?.[i * 2] ?? 0,
      blockerPct: native.blocker_metrics?.[i * 2 + 1] ?? 0,
      fold: native.strategy[i * 3] ?? 0,
      call: native.strategy[i * 3 + 1] ?? 0,
      raise: native.strategy[i * 3 + 2] ?? 0,
      foldEv: native.action_evs?.[i * 3] ?? 0,
      callEv: native.action_evs?.[i * 3 + 1] ?? 0,
      raiseEv: native.action_evs?.[i * 3 + 2] ?? 0,
      bestRaiseAmount: native.best_raise_amounts?.[i] ?? native.spot?.bet ?? 0,
      ev: metrics.ev[i] ?? 0,
      equity: metrics.equity[i] ?? 0,
      eqr: metrics.eqr[i] ?? 0
    })),
    exploitability: native.progress.map((p) => ({ iteration: p.iter, value: p.exploitability_pct })),
    metrics: {
      spr: native.metrics[combos.length * 3] ?? 0,
      mdf: native.metrics[combos.length * 3 + 1] ?? 0,
      alpha: native.metrics[combos.length * 3 + 2] ?? 0,
      potOdds: native.metrics[combos.length * 3 + 3] ?? 0,
      brGapPctPot: native.metrics[combos.length * 3 + 4],
      ploFastExploitability: native.metrics[combos.length * 3 + 5],
      ploSampleCount: native.metrics[combos.length * 3 + 6],
      ploWeightCoverage: native.metrics[combos.length * 3 + 7],
      ploOpponentSampleCount: native.metrics[combos.length * 3 + 8],
      ploOpponentWeightCoverage: native.metrics[combos.length * 3 + 9],
      ploIterations: native.metrics[combos.length * 3 + 10],
      ploComboCap: native.metrics[combos.length * 3 + 11],
      ploEquitySamples: native.metrics[combos.length * 3 + 12]
    }
  };
}

export const engine: EngineAPI = new WasmPreferredEngine();

function infoSetsFromNodes(nodes: SolveNode[]): SolveInfoSet[] {
  return nodes.map((node) => ({ key: node.infoSet ?? `${node.street}:${node.id}`, nodeId: node.id, street: node.street, actions: node.actions, ...infoSetRefs(node) }));
}

function infoSetRefs(node: SolveNode): Pick<SolveInfoSet, "strategyRef" | "metricRef"> {
  if (node.amount !== undefined && node.actions.length) return { strategyRef: "bet-response", metricRef: "bet-response" };
  if (node.amount !== undefined) return { strategyRef: "terminal", metricRef: `response:${node.id}` };
  if (node.id === "root") return { strategyRef: "root", metricRef: "root" };
  if (node.id === "root/raise-sizes") return { strategyRef: "raise-sizes", metricRef: "raise-sizes" };
  if (node.id.startsWith("root/turn-") || node.id.startsWith("root/river-")) return { strategyRef: node.id, metricRef: node.id };
  if (node.id.startsWith("root/")) return { strategyRef: "terminal", metricRef: `action:${node.id.slice("root/".length)}` };
  return { strategyRef: node.id, metricRef: node.id };
}

function isChanceNode(node: SolveNode): boolean {
  return /^root\/(?:turn|river)-(?:low|mid|high|[2-9TJQKA][cdhs])$/i.test(node.id);
}

function chanceParentNode(node: SolveNode): SolveNode | null {
  const match = /^(root\/(?:turn|river)-(?:low|mid|high|[2-9TJQKA][cdhs]))\//i.exec(node.id);
  if (!match) return null;
  return { ...node, id: match[1]!, actions: ["fold", "call", "raise"], amount: undefined, pot: undefined };
}

function chanceRows(result: SolveResult, spot: LocalSpot, node: SolveNode): SolverRow[] {
  const pot = node.pot ?? spot.pot + spot.bet * 2;
  const betAmounts = chanceBetAmounts(spot, node, pot);
  const bet = betAmounts[0] ?? spot.bet;
  return result.rows.map((row) => {
    const equity = nlhChanceEquity(row.combo, row.equity, spot.board ?? "", node.id, spot.villainRange ?? "");
    const { callEv, raiseEv } = localActionEvs(equity, pot, bet, spot.rakePct ?? 0, spot.rakeCap ?? 0, betAmounts);
    const strategy = localCfrStrategy(0, callEv, raiseEv);
    const ev = (strategy.call * callEv + strategy.raise * raiseEv) / 100;
    return { ...row, ...strategy, equity, callEv: callEv / 100, raiseEv: raiseEv / 100, ev, eqr: ev / Math.max(0.0001, equity * pot / 100) };
  });
}

function chanceBetAmounts(spot: LocalSpot, node: SolveNode, pot: number): number[] {
  if (!spot.betTree?.trim()) return [spot.bet];
  const boardLen = node.street === "turn" ? 4 : node.street === "river" ? 5 : 0;
  if (!boardLen) return [spot.bet];
  const tree = parseBetTree(spot.betTree);
  const sizes = boardLen === 4 ? tree.turn : tree.river;
  const stack = spot.stack ?? spot.pot * 4.2;
  const amounts = spot.game === "PLO4" || spot.game === "PLO5"
    ? concretePotLimitBets(sizes, pot, spot.bet, stack)
    : concreteBets(sizes, pot, stack);
  return amounts.length ? amounts : [spot.bet];
}

function localActionEvs(equity: number, pot: number, bet: number, rakePct: number, rakeCap: number, raiseBets = [bet]): { callEv: number; raiseEv: number } {
  const rake = Math.min((pot + bet) * (rakePct / 100), rakeCap);
  const callEv = equity * (pot + bet - rake) - (1 - equity) * bet;
  const raiseEv = Math.max(...raiseBets.map((amount) => {
    const raiseRake = Math.min((pot + amount) * (rakePct / 100), rakeCap);
    const base = equity * (pot + amount - raiseRake) - (1 - equity) * amount;
    const foldResponse = amount / (pot + amount);
    const callResponse = pot / (pot + amount);
    return foldResponse * pot + callResponse * base;
  }));
  return { callEv, raiseEv };
}

function localCfrStrategy(foldEv: number, callEv: number, raiseEv: number): Pick<SolverRow, "fold" | "call" | "raise"> {
  const evs = [foldEv, callEv, raiseEv];
  const regrets = [0, 0, 0];
  const sums = [0, 0, 0];
  for (let i = 0; i < 256; i++) {
    const positives = regrets.map((value) => Math.max(0, value));
    const total = positives.reduce((sum, value) => sum + value, 0);
    const strategy = total > 0 ? positives.map((value) => value / total) : [1 / 3, 1 / 3, 1 / 3];
    const nodeEv = strategy.reduce((sum, value, idx) => sum + value * evs[idx]!, 0);
    for (let idx = 0; idx < 3; idx++) {
      regrets[idx]! += evs[idx]! - nodeEv;
      sums[idx]! += strategy[idx]!;
    }
  }
  const total = sums.reduce((sum, value) => sum + value, 0);
  return { fold: sums[0]! / total, call: sums[1]! / total, raise: sums[2]! / total };
}
