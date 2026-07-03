import { solveRiverSpot } from "@gto-lab/engine-wasm";

type Req = { id: string; type: "solve"; payload: { pot: number; bet: number } };

self.onmessage = (event: MessageEvent<Req>) => {
  const { id, payload } = event.data;
  const result = solveRiverSpot(payload.pot, payload.bet);
  for (const point of result.exploitability) self.postMessage({ id, type: "progress", point });
  self.postMessage({ id, type: "done", result });
};
