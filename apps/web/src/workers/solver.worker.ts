import { engine } from "@gto-lab/engine-wasm";

type Req = { id: string; type: "solve"; payload: { pot: number; bet: number; stack?: number } };

self.onmessage = (event: MessageEvent<Req>) => {
  const { id, payload } = event.data;
  void engine.init().then(async () => {
    const handle = await engine.solve(JSON.stringify(payload));
    const result = await engine.result(handle);
    for (const point of result.exploitability) self.postMessage({ id, type: "progress", point });
    self.postMessage({ id, type: "done", result });
  });
};
