import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { parseCard, equity, parseNlhRange, parsePloRange, serializeRange, solveRiverSpot } from "@gto-lab/engine-wasm";
import { CardView } from "../components/CardView";
import { Metric } from "../components/Metric";
import { StrategyTable } from "../components/StrategyTable";
import { cacheStats, clearAllData, clearStore, loadRange, saveRange, type CacheStats } from "../lib/db";
import { runSolve } from "../lib/solverClient";
import { decodeSpot, encodeSpot } from "../lib/spotUrl";
import { useAppStore } from "../state/store";

const ranks = "AKQJT98765432";

export function Dashboard() {
  const result = useAppStore((s) => s.result) ?? solveRiverSpot(100, 66);
  return (
    <div className="grid">
      <div>
        <h1 className="title">GTO Lab</h1>
        <p className="muted">学習用のブラウザ完結ポーカー解析ワークベンチ。リアルタイム補助用途ではありません。</p>
      </div>
      <div className="grid cols-3">
        <Metric label="Recent exploitability" value={`${result.exploitability.at(-1)!.value.toFixed(2)}% pot`} />
        <Metric label="Average EV loss" value="0.034bb" />
        <Metric label="Saved drills" value="18" />
      </div>
      <div className="card" style={{ height: 280 }}><Curve data={result.exploitability} /></div>
    </div>
  );
}

export function RangeExplorer() {
  return (
    <div className="grid">
      <h1 className="title">Range Explorer</h1>
      <div className="matrix">
        {[...ranks].flatMap((a, i) => [...ranks].map((b, j) => {
          const pair = i === j;
          const label = pair ? `${a}${b}` : i < j ? `${a}${b}s` : `${b}${a}o`;
          const w = Math.max(0.08, 1 - (i + j) / 20);
          return (
            <div className="cell" key={`${i}-${j}`} style={{ background: `rgba(79,70,229,${w * .35})` }} title={`${label} ${Math.round(w * 100)}%`}>
              <span className="num">{label}</span>
              <div className="bar"><i style={{ width: "18%" }} /><i style={{ width: "46%" }} /><i style={{ width: "36%" }} /></div>
            </div>
          );
        }))}
      </div>
      <div className="card"><b>PLO views</b><p className="muted">Category tree, syntax search, and virtual hand list are represented by the range parser in this slice.</p></div>
    </div>
  );
}

export function SolverStudio() {
  const shared = decodeSpot(new URLSearchParams(window.location.search).get("spot"));
  const [pot, setPot] = useState(shared?.pot ?? 100);
  const [bet, setBet] = useState(shared?.bet ?? 66);
  const [stack, setStack] = useState(shared?.stack ?? 420);
  const [board, setBoard] = useState(shared?.board ?? "Ah Kd 7c");
  const [progress, setProgress] = useState<{ iteration: number; value: number }[]>([]);
  const [cached, setCached] = useState(false);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef<AbortController | null>(null);
  const result = useAppStore((s) => s.result);
  const setResult = useAppStore((s) => s.setResult);
  const shown = result ?? solveRiverSpot(pot, bet, stack, board);
  return (
    <div className="split">
      <section className="card grid">
        <h1 className="title">Solver Studio</h1>
        <label className="field">Game<select><option>NLH</option><option>PLO4</option><option>PLO5</option></select></label>
        <label className="field">Pot<input type="number" min="1" value={pot} onChange={(e) => setPot(Number(e.target.value))} /></label>
        <label className="field">Bet<input type="number" min="0" value={bet} onChange={(e) => setBet(Number(e.target.value))} /></label>
        <label className="field">Stack<input type="number" min="1" value={stack} onChange={(e) => setStack(Number(e.target.value))} /></label>
        <label className="field">Board<input value={board} onChange={(e) => setBoard(e.target.value)} /></label>
        <button className="btn primary" onClick={() => {
          const controller = new AbortController();
          cancelRef.current = controller;
          setRunning(true);
          setProgress([]);
          setCached(false);
          history.replaceState(null, "", `/solver?spot=${encodeSpot({ pot, bet, stack, board })}`);
          void runSolve({ pot, bet, stack, board }, (p) => setProgress((xs) => [...xs, p]), controller.signal).then((run) => {
            setCached(run.cached);
            setResult(run.result);
          }).catch((err: unknown) => {
            if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
          }).finally(() => {
            if (cancelRef.current === controller) {
              cancelRef.current = null;
              setRunning(false);
            }
          });
        }}>Start solve</button>
        <button className="btn" disabled={!running} onClick={() => cancelRef.current?.abort()}>Cancel</button>
        {cached ? <span className="badge">cached</span> : null}
      </section>
      <section className="card">
        <h2 className="title">Strategy</h2>
        <StrategyTable rows={shown.rows} />
      </section>
      <section className="grid">
        <Metric label="MDF" value={`${(shown.metrics.mdf * 100).toFixed(1)}%`} />
        <Metric label="SPR" value={shown.metrics.spr.toFixed(2)} />
        <Metric label="Bluff breakeven alpha" value={`${(shown.metrics.alpha * 100).toFixed(1)}%`} />
        <Metric label="Pot odds" value={`${(shown.metrics.potOdds * 100).toFixed(1)}%`} />
        <div className="card" style={{ height: 220 }}><Curve data={progress.length ? progress : shown.exploitability} /></div>
      </section>
    </div>
  );
}

export function EquityLab() {
  const [p1, setP1] = useState("As Ah");
  const [p2, setP2] = useState("Kc Kd");
  const [board, setBoard] = useState("");
  const rows = useMemo(() => {
    try {
      const parse = (s: string) => s.trim().split(/\s+/).filter(Boolean).map(parseCard);
      return equity([{ cards: parse(p1) }, { cards: parse(p2) }], parse(board), "NLH", board.trim() ? 0 : 20000, 11);
    } catch { return []; }
  }, [p1, p2, board]);
  return (
    <div className="grid">
      <h1 className="title">Equity Lab</h1>
      <div className="grid cols-3">
        <label className="field">Player 1<input value={p1} onChange={(e) => setP1(e.target.value)} /></label>
        <label className="field">Player 2<input value={p2} onChange={(e) => setP2(e.target.value)} /></label>
        <label className="field">Board<input value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Board cards example Ah Kd 7c" /></label>
      </div>
      <div className="grid cols-3">
        {rows.map((r, i) => <Metric key={i} label={`Player ${i + 1}`} value={`${(r.equity * 100).toFixed(2)}% ± ${(r.ci95 * 100).toFixed(2)}`} />)}
      </div>
      <div className="cards">{[...p1.split(/\s+/), ...p2.split(/\s+/)].filter(Boolean).map((c) => <CardView key={c} card={parseCard(c)} />)}</div>
    </div>
  );
}

export function Trainer() {
  const spot = solveRiverSpot(100, 66);
  const row = spot.rows[0]!;
  const bestEv = Math.max(row.foldEv, row.callEv, row.raiseEv);
  const [choice, setChoice] = useState<"fold" | "call" | "raise" | null>(null);
  const chosenEv = choice === "fold" ? row.foldEv : choice === "call" ? row.callEv : choice === "raise" ? row.raiseEv : null;
  const loss = chosenEv === null ? null : bestEv - chosenEv;
  const grade = loss === null ? "Choose an action" : loss <= 0.005 ? "Perfect" : loss <= 0.05 ? "Good" : loss <= 0.2 ? "Inaccuracy" : "Blunder";
  return (
    <div className="grid">
      <h1 className="title">Trainer</h1>
      <div className="card">
        <p className="muted">BTN vs BB, SRP, flop Ah Kd 7c. Hero: As Qs.</p>
        <div className="cards"><CardView card={parseCard("As")} /><CardView card={parseCard("Qs")} /><CardView card={parseCard("Ah")} /><CardView card={parseCard("Kd")} /><CardView card={parseCard("7c")} /></div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}><button className="btn" onClick={() => setChoice("fold")}>Fold</button><button className="btn" onClick={() => setChoice("call")}>Call</button><button className="btn primary" onClick={() => setChoice("raise")}>Bet 66%</button></div>
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          <Metric label="EV loss" value={loss === null ? "-" : `${loss.toFixed(3)}bb`} />
          <Metric label="Grade" value={grade} />
          <Metric label="GTO raise" value={`${(row.raise * 100).toFixed(0)}%`} />
        </div>
      </div>
    </div>
  );
}

export function RangeEditor() {
  const [text, setText] = useState("AA, KQs, A5s:0.5");
  const [status, setStatus] = useState("ready");
  useEffect(() => {
    void loadRange("default").then((saved) => {
      if (saved) setText(saved);
    });
  }, []);
  const parsed = useMemo(() => {
    try { return serializeRange(parseNlhRange(text)); } catch { return "Invalid range"; }
  }, [text]);
  const plo = useMemo(() => parsePloRange("AA**:ds@100, AA**:ss@60").map((r) => `${r.label} ${r.weight}`).join(" / "), []);
  return (
    <div className="grid">
      <h1 className="title">Range Editor</h1>
      <textarea className="card" value={text} onChange={(e) => setText(e.target.value)} rows={5} />
      <button className="btn primary" onClick={() => void saveRange("default", text).then(() => setStatus("saved"))}>Save</button>
      <div className="card"><b>Round trip</b><p className="num">{parsed}</p><p className="muted">PLO sample: {plo}</p><p>{status}</p></div>
    </div>
  );
}

export function Settings() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const refresh = () => void cacheStats().then(setStats);
  useEffect(refresh, []);
  return (
    <div className="grid">
      <h1 className="title">Settings</h1>
      <div className="grid cols-3">
        <label className="field">Theme<select value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
        <label className="field">Deck colors<select><option>Four color</option><option>Two color</option></select></label>
        <label className="field">Precision<select><option>Balanced</option><option>Fast</option><option>Precise</option></select></label>
      </div>
      <div className="card grid">
        <h2 className="title">Data</h2>
        <p className="muted">Solve cache capacity is 500MB with oldest solves removed first.</p>
        <div className="grid cols-3">
          <Metric label="Solves" value={stats?.solves ?? 0} />
          <Metric label="Ranges" value={stats?.ranges ?? 0} />
          <Metric label="Training" value={stats?.training ?? 0} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => void clearStore("solves").then(refresh)}>Clear solves</button>
          <button className="btn" onClick={() => void clearStore("ranges").then(refresh)}>Clear ranges</button>
          <button className="btn" onClick={() => void clearAllData().then(refresh)}>Clear all data</button>
        </div>
      </div>
    </div>
  );
}

export function UiGallery() {
  return (
    <div className="grid">
      <h1 className="title">UI Gallery</h1>
      <div className="grid cols-3"><Metric label="Range EV" value="12.42bb" /><Metric label="Equity" value="58.7%" /><Metric label="EQR" value="1.08" /></div>
      <div className="card"><button className="btn primary">Primary</button> <button className="btn">Secondary</button></div>
      <RangeExplorer />
    </div>
  );
}

function Curve({ data }: { data: { iteration: number; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
        <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity=".6" /><stop offset="100%" stopColor="#38bdf8" stopOpacity="0" /></linearGradient></defs>
        <CartesianGrid stroke="rgba(148,163,184,.11)" vertical={false} />
        <XAxis dataKey="iteration" stroke="#8a94a6" fontSize={11} />
        <YAxis stroke="#8a94a6" fontSize={11} />
        <Tooltip contentStyle={{ background: "#101624", border: "1px solid rgba(148,163,184,.16)", color: "#e6eaf2" }} />
        <Area type="monotone" dataKey="value" stroke="#38bdf8" fill="url(#g)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
