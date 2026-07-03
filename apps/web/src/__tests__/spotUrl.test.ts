import { describe, expect, it } from "vitest";
import { decodeSpot, encodeSpot } from "../lib/spotUrl";

describe("solver spot URL codec", () => {
  it("round trips base64url spot configs", () => {
    const spot = { game: "PLO4" as const, pot: 101, bet: 50, stack: 300, board: "Ah Kd 7c", rakePct: 5, rakeCap: 10 };
    expect(decodeSpot(encodeSpot(spot))).toEqual(spot);
  });

  it("ignores invalid spot query values", () => {
    expect(decodeSpot("not-json")).toBeNull();
    expect(decodeSpot(encodeSpot({ game: "NLH", pot: Number.NaN, bet: 50, stack: 300, board: "Ah", rakePct: 0, rakeCap: 0 }))).toBeNull();
  });
});
