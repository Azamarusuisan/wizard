import { describe, expect, it } from "vitest";

describe("app settings store", () => {
  it("persists language and theme settings", async () => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      }
    });
    const { useAppStore } = await import("../state/store");
    useAppStore.getState().setLang("en");
    useAppStore.getState().setTheme("light");
    expect(values.get("gto-lab.lang")).toBe("en");
    expect(values.get("gto-lab.theme")).toBe("light");
  });
});
