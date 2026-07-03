import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { loadRange, loadSolve, saveRange, saveSolve } from "../lib/db";
import { solveRiverSpot } from "@gto-lab/engine-wasm";

describe("IndexedDB cache", () => {
  it("round trips ranges", async () => {
    await saveRange("default", "AA, KQs:0.5");
    await expect(loadRange("default")).resolves.toBe("AA, KQs:0.5");
  });

  it("round trips quantized solve results", async () => {
    const spot = { bet: 66, pot: 100 };
    const result = solveRiverSpot(100, 66);
    await saveSolve(spot, result);
    const restored = await loadSolve({ pot: 100, bet: 66 });
    expect(restored?.rows[0]?.combo).toBe(result.rows[0]?.combo);
    expect(restored?.rows[0]?.fold).toBeCloseTo(result.rows[0]!.fold, 4);
    expect(restored?.metrics.mdf).toBeCloseTo(result.metrics.mdf, 6);
  });
});
