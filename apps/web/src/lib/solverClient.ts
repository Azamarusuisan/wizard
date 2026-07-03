import type { SolveResult } from "@gto-lab/engine-wasm";
import { loadSolve, saveSolve } from "./db";

export type SolveRun = { result: SolveResult; cached: boolean };

export async function runSolve(payload: { pot: number; bet: number; stack?: number }, onProgress: (p: { iteration: number; value: number }) => void): Promise<SolveRun> {
  const cached = await loadSolve(payload);
  if (cached) return { result: cached, cached: true };
  const worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), { type: "module" });
  const id = crypto.randomUUID();
  return await new Promise((resolve, reject) => {
    worker.onerror = reject;
    worker.onmessage = (event: MessageEvent<{ id: string; type: string; point?: { iteration: number; value: number }; result?: SolveResult }>) => {
      if (event.data.id !== id) return;
      if (event.data.type === "progress" && event.data.point) onProgress(event.data.point);
      if (event.data.type === "done" && event.data.result) {
        worker.terminate();
        void saveSolve(payload, event.data.result).then(() => resolve({ result: event.data.result!, cached: false }), reject);
      }
    };
    worker.postMessage({ id, type: "solve", payload });
  });
}
