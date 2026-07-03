import { describe, expect, it } from "vitest";
import { decodeSpot, encodeSpot } from "../lib/spotUrl";

describe("solver spot URL codec", () => {
  it("round trips base64url spot configs", () => {
    const spot = { pot: 101, bet: 50, stack: 300, board: "Ah Kd 7c" };
    expect(decodeSpot(encodeSpot(spot))).toEqual(spot);
  });

  it("ignores invalid spot query values", () => {
    expect(decodeSpot("not-json")).toBeNull();
    expect(decodeSpot(encodeSpot({ pot: Number.NaN, bet: 50, stack: 300, board: "Ah" }))).toBeNull();
  });
});
