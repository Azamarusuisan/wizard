import type { SolveResult } from "@gto-lab/engine-wasm";
import { loadSolve, saveSolve } from "./db";

export type SolveRun = { result: SolveResult; cached: boolean };
export type SolvePayload = { pot: number; bet: number; stack?: number; board?: string };

export async function runSolve(payload: SolvePayload, onProgress: (p: { iteration: number; value: number }) => void, signal?: AbortSignal): Promise<SolveRun> {
  const cached = await loadSolve(payload);
  if (cached) return { result: cached, cached: true };
  const worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), { type: "module" });
  const id = crypto.randomUUID();
  return await new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      worker.postMessage({ id, type: "cancel" });
      worker.terminate();
      reject(new DOMException("Solve canceled", "AbortError"));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = reject;
    worker.onmessage = (event: MessageEvent<{ id: string; type: string; point?: { iteration: number; value: number }; result?: SolveResult }>) => {
      if (event.data.id !== id) return;
      if (event.data.type === "progress" && event.data.point) onProgress(event.data.point);
      if (event.data.type === "done" && event.data.result) {
        settled = true;
        worker.terminate();
        signal?.removeEventListener("abort", abort);
        void saveSolve(payload, event.data.result).then(() => resolve({ result: event.data.result!, cached: false }), reject);
      }
    };
    worker.postMessage({ id, type: "solve", payload });
  });
}
