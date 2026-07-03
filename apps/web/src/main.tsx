import { BarChart3, Brain, Calculator, Grid3X3, Settings as SettingsIcon, SlidersHorizontal, Table2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./design/tokens.css";
import { Dashboard, EquityLab, RangeEditor, RangeExplorer, Settings, SolverStudio, Trainer, UiGallery } from "./pages/Pages";
import { dict } from "./lib/i18n";
import { useAppStore } from "./state/store";

const routes = [
  ["/", "dashboard", BarChart3, Dashboard],
  ["/range", "range", Grid3X3, RangeExplorer],
  ["/solver", "solver", SlidersHorizontal, SolverStudio],
  ["/equity", "equity", Calculator, EquityLab],
  ["/trainer", "trainer", Brain, Trainer],
  ["/editor", "editor", Table2, RangeEditor],
  ["/settings", "settings", SettingsIcon, Settings],
  ["/dev/ui", "UI", Grid3X3, UiGallery]
] as const;

function App() {
  const path = window.location.pathname;
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const match = routes.find(([p]) => p === path) ?? routes[0]!;
  const Page = match[3];
  return (
    <div className="app">
      <nav className="nav" aria-label="Primary">
        <div className="brand">GTO Lab</div>
        {routes.map(([href, key, Icon]) => (
          <button key={href} className={href === path ? "active" : ""} onClick={() => { history.pushState(null, "", href); window.dispatchEvent(new PopStateEvent("popstate")); }}>
            <Icon size={17} /> {key === "UI" ? "UI Gallery" : dict[lang][key as keyof typeof dict.ja]}
          </button>
        ))}
      </nav>
      <main className="main">
        <header className="top"><span className="muted">Study / {match[1]}</span><button className="btn" onClick={() => setLang(lang === "ja" ? "en" : "ja")}>{lang.toUpperCase()}</button></header>
        <AnimatePresence mode="wait">
          <motion.div key={path} className="content" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: .18 }}>
            <Page />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function Root() {
  const [, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return <App />;
}

createRoot(document.getElementById("root")!).render(<Root />);
