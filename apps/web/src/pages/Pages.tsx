import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { parseCard, equity, parseNlhRange, parsePloRange, serializeRange, solveRiverSpot, type Game } from "@gto-lab/engine-wasm";
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
  const [stats, setStats] = useState<CacheStats | null>(null);
  useEffect(() => {
    void cacheStats().then(setStats);
  }, []);
  return (
    <div className="grid">
      <div>
        <h1 className="title">GTO Lab</h1>
        <p className="muted">学習用のブラウザ完結ポーカー解析ワークベンチ。リアルタイム補助用途ではありません。</p>
      </div>
      <div className="grid cols-3">
        <Metric label="Recent exploitability" value={`${result.exploitability.at(-1)!.value.toFixed(2)}% pot`} />
        <Metric label="Average EV loss" value={stats?.training ? "tracked" : "No sessions"} />
        <Metric label="Saved solves" value={stats?.solves ?? 0} />
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
  const [game, setGame] = useState<Game>(shared?.game ?? "NLH");
  const [pot, setPot] = useState(shared?.pot ?? 100);
  const [bet, setBet] = useState(shared?.bet ?? 66);
  const [stack, setStack] = useState(shared?.stack ?? 420);
  const [rakePct, setRakePct] = useState(shared?.rakePct ?? 0);
  const [rakeCap, setRakeCap] = useState(shared?.rakeCap ?? 0);
  const [board, setBoard] = useState(shared?.board ?? "Ah Kd 7c");
  const [progress, setProgress] = useState<{ iteration: number; value: number }[]>([]);
  const [cached, setCached] = useState(false);
  const [running, setRunning] = useState(false);
  const [resultKey, setResultKey] = useState("");
  const cancelRef = useRef<AbortController | null>(null);
  const result = useAppStore((s) => s.result);
  const setResult = useAppStore((s) => s.setResult);
  const currentKey = JSON.stringify({ game, pot, bet, stack, board, rakePct, rakeCap });
  const preview = useMemo(() => {
    try {
      validateSolverInputs(game, pot, bet, stack, board, rakePct, rakeCap);
      if (game === "NLH" && board.trim()) return { result: null, error: "" };
      return { result: solveRiverSpot(pot, bet, stack, board, rakePct, rakeCap, game), error: "" };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : "invalid spot" };
    }
  }, [game, pot, bet, stack, board, rakePct, rakeCap]);
  const shown = preview.error ? null : result && resultKey === currentKey ? result : preview.result;
  return (
    <div className="split">
      <section className="card grid">
        <h1 className="title">Solver Studio</h1>
        <label className="field">Game<select value={game} onChange={(e) => setGame(e.target.value as Game)}><option>NLH</option><option>PLO4</option><option>PLO5</option></select></label>
        <label className="field">Pot<input type="number" min="1" value={pot} onChange={(e) => setPot(Number(e.target.value))} /></label>
        <label className="field">Bet<input type="number" min="0" value={bet} onChange={(e) => setBet(Number(e.target.value))} /></label>
        <label className="field">Stack<input type="number" min="1" value={stack} onChange={(e) => setStack(Number(e.target.value))} /></label>
        <label className="field">Rake %<input type="number" min="0" max="100" step="0.1" value={rakePct} onChange={(e) => setRakePct(Number(e.target.value))} /></label>
        <label className="field">Rake cap<input type="number" min="0" step="0.1" value={rakeCap} onChange={(e) => setRakeCap(Number(e.target.value))} /></label>
        <label className="field">Board<input value={board} onChange={(e) => setBoard(e.target.value)} /></label>
        {preview.error ? <p className="error" role="alert">{preview.error}</p> : null}
        <button className="btn primary" disabled={!!preview.error || running} onClick={() => {
          if (preview.error || running || cancelRef.current) return;
          const controller = new AbortController();
          cancelRef.current = controller;
          setRunning(true);
          setProgress([]);
          setCached(false);
          const payload = { game, pot, bet, stack, board, rakePct, rakeCap };
          const payloadKey = JSON.stringify(payload);
          history.replaceState(null, "", `/solver?spot=${encodeSpot(payload)}`);
          void runSolve(payload, (p) => setProgress((xs) => [...xs, p]), controller.signal).then((run) => {
            setCached(run.cached);
            setResultKey(payloadKey);
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
        <span className="badge">abstracted</span>
        <p className="muted">Exploitability is measured on the current default-combo abstraction, not a full postflop tree.</p>
      </section>
      <section className="card">
        <h2 className="title">Strategy</h2>
        {shown ? <StrategyTable rows={shown.rows} /> : <p className="muted">Fix spot inputs to preview strategy.</p>}
      </section>
      <section className="grid">
        {shown ? <>
          <Metric label="MDF" value={`${(shown.metrics.mdf * 100).toFixed(1)}%`} />
          <Metric label="SPR" value={shown.metrics.spr.toFixed(2)} />
          <Metric label="Bluff breakeven alpha" value={`${(shown.metrics.alpha * 100).toFixed(1)}%`} />
          <Metric label="Pot odds" value={`${(shown.metrics.potOdds * 100).toFixed(1)}%`} />
          {shown.metrics.brGapPctPot !== undefined ? <Metric label="BR gap" value={`${shown.metrics.brGapPctPot.toFixed(2)}% pot`} /> : null}
          {shown.metrics.ploFastExploitability !== undefined ? <Metric label="PLO Fast BR" value={`${shown.metrics.ploFastExploitability.toFixed(2)}% pot`} /> : null}
          <div className="card" style={{ height: 220 }}><Curve data={progress.length ? progress : shown.exploitability} /></div>
        </> : <div className="card"><p className="muted">No valid spot.</p></div>}
      </section>
    </div>
  );
}

function validateSolverInputs(game: Game, pot: number, bet: number, stack: number, board: string, rakePct: number, rakeCap: number): void {
  if (!Number.isFinite(pot) || pot <= 0) throw new Error("pot must be positive");
  if (!Number.isFinite(bet) || bet < 0) throw new Error("bet must be non-negative");
  if (!Number.isFinite(stack) || stack <= 0) throw new Error("stack must be positive");
  if (!Number.isFinite(rakePct) || rakePct < 0 || rakePct > 100) throw new Error("rake percent must be 0-100");
  if (!Number.isFinite(rakeCap) || rakeCap < 0) throw new Error("rake cap must be non-negative");
  const cards = board.trim() ? board.trim().split(/\s+/).map(parseCard) : [];
  if (cards.length > 5) throw new Error("board cannot have more than five cards");
  if (new Set(cards).size !== cards.length) throw new Error("duplicate board cards");
}

export function EquityLab() {
  const [game, setGame] = useState<Game>("NLH");
  const [mode, setMode] = useState<"auto" | "exact" | "mc">("auto");
  const [iterations, setIterations] = useState(20000);
  const [players, setPlayers] = useState(["As Ah", "Kc Kd"]);
  const [board, setBoard] = useState("");
  const [dead, setDead] = useState("");
  const parse = (s: string) => s.trim().split(/\s+/).filter(Boolean).map(parseCard);
  const setPlayer = (index: number, value: string) => setPlayers((xs) => xs.map((x, i) => i === index ? value : x));
  const calc = useMemo(() => {
    try {
      const samples = mode === "exact" ? 0 : mode === "mc" ? Math.max(1, iterations) : board.trim() ? 0 : Math.max(1, iterations);
      return { rows: equity(players.map((p) => ({ cards: parse(p) })), parse(board), game, samples, 11, parse(dead)), error: "" };
    } catch (err) {
      return { rows: [], error: err instanceof Error ? err.message : "invalid equity input" };
    }
  }, [players, board, dead, game, mode, iterations]);
  const cards = useMemo(() => {
    try { return parse(players.join(" ")); } catch { return []; }
  }, [players]);
  return (
    <div className="grid">
      <h1 className="title">Equity Lab</h1>
      <div className="grid cols-3">
        <label className="field">Game<select value={game} onChange={(e) => setGame(e.target.value as Game)}><option>NLH</option><option>PLO4</option><option>PLO5</option></select></label>
        <label className="field">Mode<select value={mode} onChange={(e) => setMode(e.target.value as "auto" | "exact" | "mc")}><option value="auto">Auto</option><option value="exact">Exact</option><option value="mc">MC</option></select></label>
        <label className="field">Iterations<input type="number" min="1" value={iterations} onChange={(e) => setIterations(Number(e.target.value))} /></label>
        {players.map((player, i) => <label className="field" key={i}>Player {i + 1}<input value={player} onChange={(e) => setPlayer(i, e.target.value)} /></label>)}
        <label className="field">Board<input value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Board cards example Ah Kd 7c" /></label>
        <label className="field">Dead<input value={dead} onChange={(e) => setDead(e.target.value)} aria-label="Dead cards example Ac Td" /></label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={players.length >= 6} onClick={() => setPlayers((xs) => [...xs, "Qs Qh"])}>Add player</button>
        <button className="btn" disabled={players.length <= 2} onClick={() => setPlayers((xs) => xs.slice(0, -1))}>Remove player</button>
      </div>
      {calc.error ? <p className="error" role="alert">{calc.error}</p> : null}
      <div className="grid cols-3">
        {calc.rows.map((r, i) => <Metric key={i} label={`Player ${i + 1}`} value={`Eq ${(r.equity * 100).toFixed(2)}% / W ${(r.win * 100).toFixed(2)}% / T ${(r.tie * 100).toFixed(2)}% / CI ± ${(r.ci95 * 100).toFixed(2)}`} />)}
      </div>
      <div className="cards">{cards.map((c) => <CardView key={c} card={c} />)}</div>
    </div>
  );
}

export function Trainer() {
  const spot = solveRiverSpot(100, 66);
  const row = spot.rows[0]!;
  const bestEv = Math.max(row.foldEv, row.callEv, row.raiseEv);
  const [choice, setChoice] = useState<"fold" | "call" | "raise" | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if (key === "f" || key === "x") setChoice("fold");
      if (key === "c") setChoice("call");
      if (key === "b" || key === "r") setChoice("raise");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
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
  const deckColors = useAppStore((s) => s.deckColors);
  const setDeckColors = useAppStore((s) => s.setDeckColors);
  const precision = useAppStore((s) => s.precision);
  const setPrecision = useAppStore((s) => s.setPrecision);
  const refresh = () => void cacheStats().then(setStats);
  useEffect(refresh, []);
  return (
    <div className="grid">
      <h1 className="title">Settings</h1>
      <div className="grid cols-3">
        <label className="field">Theme<select value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
        <label className="field">Deck colors<select value={deckColors} onChange={(e) => setDeckColors(e.target.value as "four" | "two")}><option value="four">Four color</option><option value="two">Two color</option></select></label>
        <label className="field">Precision<select value={precision} onChange={(e) => setPrecision(e.target.value as "fast" | "balanced" | "precise")}><option value="balanced">Balanced</option><option value="fast">Fast</option><option value="precise">Precise</option></select></label>
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
