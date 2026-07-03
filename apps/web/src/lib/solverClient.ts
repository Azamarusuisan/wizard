import type { SolveResult } from "@gto-lab/engine-wasm";

export function runSolve(payload: { pot: number; bet: number }, onProgress: (p: { iteration: number; value: number }) => void): Promise<SolveResult> {
  const worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), { type: "module" });
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    worker.onerror = reject;
    worker.onmessage = (event: MessageEvent<{ id: string; type: string; point?: { iteration: number; value: number }; result?: SolveResult }>) => {
      if (event.data.id !== id) return;
      if (event.data.type === "progress" && event.data.point) onProgress(event.data.point);
      if (event.data.type === "done" && event.data.result) {
        worker.terminate();
        resolve(event.data.result);
      }
    };
    worker.postMessage({ id, type: "solve", payload });
  });
}
