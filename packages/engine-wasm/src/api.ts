import { solveRiverSpot, type SolveNode, type SolveResult, type SolverRow } from "./index.js";

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
  default: (input?: URL | Uint8Array) => Promise<unknown>;
  init: (threads?: number | null) => void;
  solve: (spotJson: string) => number;
  poll_progress: (handle: number) => string;
  get_strategy: (handle: number, nodeId: string) => Float64Array;
  get_hand_metrics: (handle: number, nodeId: string) => Float64Array;
  cancel: (handle: number) => void;
  serialize: (handle: number) => Uint8Array;
};

type NativeSolve = {
  nodes?: SolveNode[];
  combos: string[];
  progress: { iter: number; exploitability_pct: number; elapsed: number }[];
  strategy: number[];
  action_evs?: number[];
  metrics: number[];
};

class LocalEngine implements EngineAPI {
  private nextHandle = 1;
  private solves = new Map<EngineHandle, SolveResult>();

  async init(_threads?: number): Promise<void> {
    await Promise.resolve();
  }

  async backend(): Promise<"wasm" | "local"> {
    return "local";
  }

  async solve(spotJson: string): Promise<EngineHandle> {
    const spot = JSON.parse(spotJson) as { game?: "NLH" | "PLO4" | "PLO5"; pot: number; bet: number; stack?: number; board?: string; rakePct?: number; rakeCap?: number; betTree?: string };
    const handle = this.nextHandle++;
    this.solves.set(handle, solveRiverSpot(spot.pot, spot.bet, spot.stack, spot.board, spot.rakePct, spot.rakeCap, spot.game, spot.betTree));
    return handle;
  }

  async pollProgress(handle: EngineHandle): Promise<Progress> {
    const result = this.mustGet(handle);
    const last = result.exploitability.at(-1)!;
    return { iteration: last.iteration, exploitabilityPct: last.value, elapsed: 0 };
  }

  async getStrategy(handle: EngineHandle, nodeId = "root"): Promise<StrategyTable> {
    const result = this.mustGet(handle);
    const node = nodeForId(result, nodeId);
    if (node.amount !== undefined && node.pot !== undefined) {
      const [fold, call] = betResponseStrategy(node.pot, node.amount);
      return { combos: result.rows.map((r) => r.combo), actions: Float64Array.from(result.rows.flatMap(() => [fold, call])) };
    }
    if (!node.actions.length) return { combos: [], actions: new Float64Array() };
    return {
      combos: result.rows.map((r: SolverRow) => r.combo),
      actions: Float64Array.from(result.rows.flatMap((r: SolverRow) => [r.fold, r.call, r.raise]))
    };
  }

  async getHandMetrics(handle: EngineHandle, nodeId = "root"): Promise<HandMetrics> {
    const result = this.mustGet(handle);
    const node = nodeForId(result, nodeId);
    if (node.amount !== undefined && node.pot !== undefined) return betResponseMetrics(result, node.pot, node.amount);
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
    const result = this.solves.get(handle);
    if (!result) throw new Error(`unknown solve handle ${handle}`);
    return result;
  }
}

function nodeForId(result: SolveResult, nodeId: string): SolveNode {
  const node = result.nodes.find((node) => node.id === nodeId);
  if (!node) throw new Error("unknown node id");
  return node;
}

function betResponseStrategy(pot: number, amount: number): [number, number] {
  return [amount / (pot + amount), pot / (pot + amount)];
}

function betResponseMetrics(result: SolveResult, pot: number, amount: number): HandMetrics {
  const [foldFreq, callFreq] = betResponseStrategy(pot, amount);
  const ev = Float32Array.from(result.rows.map((row) => {
    const callEv = row.equity * (pot + amount) - (1 - row.equity) * amount;
    return (foldFreq * pot + callFreq * callEv) / 100;
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
      await wasm.default(await wasmInitInput());
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
  const { readFile } = await import(/* @vite-ignore */ "node:fs/promises");
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
  return {
    nodes: native.nodes?.length ? native.nodes : [{ id: "root", label: "Root", street: "preflop", actions: ["fold", "call", "raise"] }],
    rows: combos.map((combo, i) => ({
      combo,
      fold: native.strategy[i * 3] ?? 0,
      call: native.strategy[i * 3 + 1] ?? 0,
      raise: native.strategy[i * 3 + 2] ?? 0,
      foldEv: native.action_evs?.[i * 3] ?? 0,
      callEv: native.action_evs?.[i * 3 + 1] ?? 0,
      raiseEv: native.action_evs?.[i * 3 + 2] ?? 0,
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
      ploFastExploitability: native.metrics[combos.length * 3 + 5]
    }
  };
}

export const engine: EngineAPI = new WasmPreferredEngine();
