import { create } from "zustand";
import type { SolveResult } from "@gto-lab/engine-wasm";

type Lang = "ja" | "en";
type Theme = "dark" | "light";

type AppState = {
  lang: Lang;
  theme: Theme;
  result: SolveResult | null;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  setResult: (result: SolveResult) => void;
};

export const useAppStore = create<AppState>((set) => ({
  lang: "ja",
  theme: "dark",
  result: null,
  setLang: (lang) => set({ lang }),
  setTheme: (theme) => set({ theme }),
  setResult: (result) => set({ result })
}));
