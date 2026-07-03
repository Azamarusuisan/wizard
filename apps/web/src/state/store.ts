import { create } from "zustand";
import type { SolveResult } from "@gto-lab/engine-wasm";

type Lang = "ja" | "en";
type Theme = "dark" | "light";
type DeckColors = "four" | "two";
type Precision = "fast" | "balanced" | "precise";

type AppState = {
  lang: Lang;
  theme: Theme;
  deckColors: DeckColors;
  precision: Precision;
  result: SolveResult | null;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  setDeckColors: (deckColors: DeckColors) => void;
  setPrecision: (precision: Precision) => void;
  setResult: (result: SolveResult) => void;
};

export const useAppStore = create<AppState>((set) => ({
  lang: readSetting<Lang>("gto-lab.lang", "ja", ["ja", "en"]),
  theme: readSetting<Theme>("gto-lab.theme", "dark", ["dark", "light"]),
  deckColors: readSetting<DeckColors>("gto-lab.deckColors", "four", ["four", "two"]),
  precision: readSetting<Precision>("gto-lab.precision", "balanced", ["fast", "balanced", "precise"]),
  result: null,
  setLang: (lang) => {
    writeSetting("gto-lab.lang", lang);
    set({ lang });
  },
  setTheme: (theme) => {
    writeSetting("gto-lab.theme", theme);
    set({ theme });
  },
  setDeckColors: (deckColors) => {
    writeSetting("gto-lab.deckColors", deckColors);
    set({ deckColors });
  },
  setPrecision: (precision) => {
    writeSetting("gto-lab.precision", precision);
    set({ precision });
  },
  setResult: (result) => set({ result })
}));

function readSetting<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  const storage = browserStorage();
  const value = storage?.getItem(key);
  return allowed.includes(value as T) ? value as T : fallback;
}

function writeSetting(key: string, value: string): void {
  browserStorage()?.setItem(key, value);
}

function browserStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  const storage = typeof window === "undefined" ? globalThis.localStorage : window.localStorage;
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" ? storage : null;
}
