import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Metric } from "../components/Metric";
import { summarizeActionComposition, summarizeRows } from "../pages/Pages";

describe("Metric", () => {
  it("renders tabular value", () => {
    render(<Metric label="Equity" value="58.7%" />);
    expect(screen.getByText("Equity")).toBeTruthy();
    expect(screen.getByText("58.7%")).toBeTruthy();
  });
});

describe("Solver summaries", () => {
  it("do not divide by zero when every row is unreachable", () => {
    const row = { combo: "QcQs", weight: 0, handClass: "pair", blockedCombos: 0, blockerPct: 0, fold: 0, call: 0, raise: 0, foldEv: 0, callEv: 0, raiseEv: 0, bestRaiseAmount: 0, equity: 0, ev: 0, eqr: 0 };
    expect(summarizeRows([row])).toEqual({ fold: 0, call: 0, raise: 0, ev: 0, equity: 0, eqr: 0, blockedCombos: 0, blockerPct: 0 });
    expect(summarizeActionComposition([row])).toBe("-");
  });
});
