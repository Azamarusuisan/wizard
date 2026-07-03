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
  assert.equal(result.rows[0]?.combo, "AA");
  assert.ok(result.exploitability.length > 0);
});
