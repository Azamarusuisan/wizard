import { engine } from "@gto-lab/engine-wasm";

type SolvePayload = { game?: "NLH" | "PLO4" | "PLO5"; pot: number; bet: number; stack?: number; board?: string; rakePct?: number; rakeCap?: number; betTree?: string };
type Req = { id: string; type: "solve"; payload: SolvePayload } | { id: string; type: "cancel" };

const handles = new Map<string, number>();
const canceled = new Set<string>();

self.onmessage = (event: MessageEvent<Req>) => {
  const { id } = event.data;
  if (event.data.type === "cancel") {
    canceled.add(id);
    const handle = handles.get(id);
    if (handle !== undefined) void engine.cancel(handle);
    handles.delete(id);
    return;
  }
  const { payload } = event.data;
  void engine.init().then(async () => {
    const handle = await engine.solve(JSON.stringify(payload));
    handles.set(id, handle);
    if (canceled.has(id)) {
      await engine.cancel(handle);
      handles.delete(id);
      return;
    }
    const result = await engine.result(handle);
    for (const point of result.exploitability) self.postMessage({ id, type: "progress", point });
    handles.delete(id);
    self.postMessage({ id, type: "done", result });
  });
};
