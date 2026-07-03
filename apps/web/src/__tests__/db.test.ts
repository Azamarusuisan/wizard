import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { cacheKey, cacheStats, clearAllData, deleteSolve, getRecord, listSolveRecords, loadRange, loadSolve, pruneSolveCache, saveRange, saveSolve } from "../lib/db";
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
    const stored = await getRecord<{ meta: { version: number } }>("solves", await cacheKey(spot));
    expect(stored?.meta.version).toBe(1);
    const restored = await loadSolve({ pot: 100, bet: 66 });
    expect(restored?.rows[0]?.combo).toBe(result.rows[0]?.combo);
    expect(restored?.rows[0]?.fold).toBeCloseTo(result.rows[0]!.fold, 4);
    expect(restored?.rows[0]?.raiseEv).toBeCloseTo(result.rows[0]!.raiseEv, 6);
    expect(restored?.metrics.mdf).toBeCloseTo(result.metrics.mdf, 6);
  });

  it("reports stats, clears stores, and prunes oldest solves", async () => {
    await clearAllData();
    const result = solveRiverSpot(100, 66);
    const key = await saveSolve({ pot: 100, bet: 66 }, result);
    expect((await listSolveRecords())[0]?.key).toBe(key);
    await deleteSolve(key);
    expect((await cacheStats()).solves).toBe(0);
    await saveSolve({ pot: 101, bet: 66 }, result);
    await pruneSolveCache(1);
    expect((await cacheStats()).solves).toBe(0);
    await saveRange("default", "AA");
    expect((await cacheStats()).ranges).toBe(1);
    await clearAllData();
    expect(await cacheStats()).toEqual({ solves: 0, ranges: 0, training: 0 });
  });
});
