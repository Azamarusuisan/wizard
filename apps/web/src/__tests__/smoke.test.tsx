import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Metric } from "../components/Metric";

describe("Metric", () => {
  it("renders tabular value", () => {
    render(<Metric label="Equity" value="58.7%" />);
    expect(screen.getByText("Equity")).toBeTruthy();
    expect(screen.getByText("58.7%")).toBeTruthy();
  });
});
