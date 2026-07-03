import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { engine } from "./index.js";

test("EngineAPI prefers generated wasm package when present", async () => {
  await engine.init();
  const backend = await engine.backend();
  if (existsSync(resolve("pkg/gto_lab_engine.js"))) assert.equal(backend, "wasm");
  const handle = await engine.solve(JSON.stringify({ pot: 100, bet: 66 }));
  const result = await engine.result(handle);
  assert.equal(result.rows[0]?.combo, "AcAd");
  assert.ok(result.rows[0]!.raiseEv >= result.rows[0]!.callEv);
  assert.ok(result.exploitability.length > 0);
  assert.equal(result.metrics.brGapPctPot, result.exploitability.at(-1)?.value);
  const plo4 = await engine.solve(JSON.stringify({ game: "PLO4", pot: 100, bet: 66 }));
  const plo4Result = await engine.result(plo4);
  assert.equal(plo4Result.rows[0]?.combo, "AsAhKsKh");
  assert.ok((plo4Result.metrics.brGapPctPot ?? -1) >= 0);
  assert.ok((plo4Result.metrics.ploFastExploitability ?? -1) >= 0);
  const plo5 = await engine.solve(JSON.stringify({ game: "PLO5", pot: 100, bet: 66 }));
  const plo5Result = await engine.result(plo5);
  assert.equal(plo5Result.rows[0]?.combo, "AsAhKsKhQs");
  assert.ok((plo5Result.metrics.brGapPctPot ?? -1) >= 0);
  assert.ok((plo5Result.metrics.ploFastExploitability ?? -1) >= 0);
});
