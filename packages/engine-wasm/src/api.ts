import { solveRiverSpot, type SolveResult, type SolverRow } from "./index.js";

export type Progress = { iteration: number; exploitabilityPct: number; elapsed: number };
export type EngineHandle = number;
export type StrategyTable = { combos: string[]; actions: Float64Array };
export type HandMetrics = { ev: Float32Array; equity: Float32Array; eqr: Float32Array };

export interface EngineAPI {
  init(threads?: number): Promise<void>;
  solve(spotJson: string): Promise<EngineHandle>;
  pollProgress(handle: EngineHandle): Promise<Progress>;
  getStrategy(handle: EngineHandle, nodeId: string): Promise<StrategyTable>;
  getHandMetrics(handle: EngineHandle, nodeId: string): Promise<HandMetrics>;
  cancel(handle: EngineHandle): Promise<void>;
  serialize(handle: EngineHandle): Promise<Uint8Array>;
  result(handle: EngineHandle): Promise<SolveResult>;
}

export class LocalEngine implements EngineAPI {
  private nextHandle = 1;
  private solves = new Map<EngineHandle, SolveResult>();

  async init(): Promise<void> {
    await Promise.resolve();
  }

  async solve(spotJson: string): Promise<EngineHandle> {
    const spot = JSON.parse(spotJson) as { pot: number; bet: number };
    const handle = this.nextHandle++;
    this.solves.set(handle, solveRiverSpot(spot.pot, spot.bet));
    return handle;
  }

  async pollProgress(handle: EngineHandle): Promise<Progress> {
    const result = this.mustGet(handle);
    const last = result.exploitability.at(-1)!;
    return { iteration: last.iteration, exploitabilityPct: last.value, elapsed: 0 };
  }

  async getStrategy(handle: EngineHandle): Promise<StrategyTable> {
    const result = this.mustGet(handle);
    return {
      combos: result.rows.map((r: SolverRow) => r.combo),
      actions: Float64Array.from(result.rows.flatMap((r: SolverRow) => [r.fold, r.call, r.raise]))
    };
  }

  async getHandMetrics(handle: EngineHandle): Promise<HandMetrics> {
    const result = this.mustGet(handle);
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

export const engine: EngineAPI = new LocalEngine();
