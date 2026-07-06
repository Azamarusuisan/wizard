import { describe, expect, it } from "vitest";
import { decodeSpot, encodeSpot } from "../lib/spotUrl";

describe("solver spot URL codec", () => {
  it("round trips base64url spot configs", () => {
    const spot = { game: "PLO4" as const, position: "BTN" as const, villainPosition: "BB" as const, potType: "3bet" as const, precision: "precise" as const, pot: 101, bet: 50, stack: 300, board: "Ah Kd 7c", rakePct: 5, rakeCap: 10, betTree: "flop 50,all-in", heroRange: "QQ,JTs", villainRange: "AA" };
    expect(decodeSpot(encodeSpot(spot))).toEqual(spot);
  });

  it("ignores invalid spot query values", () => {
    expect(decodeSpot("not-json")).toBeNull();
    expect(decodeSpot(encodeSpot({ game: "NLH", position: "BTN", villainPosition: "BB", potType: "SRP", precision: "balanced", pot: Number.NaN, bet: 50, stack: 300, board: "Ah", rakePct: 0, rakeCap: 0 }))).toBeNull();
  });
});
