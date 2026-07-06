import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EXACT_EQUITY_EVAL_THRESHOLD, HAND_CATEGORIES, concreteBets, concretePotLimitBets, deck, estimateEquityEvaluations, formatCard, parseBetTree, parseCard, equity, parseNlhRange, parsePloRange, serializeRange, solveNlhComboSpot, solveRiverSpot, type Game, type SolveNode, type SolveResult, type SolverRow } from "@gto-lab/engine-wasm";
import { CardView } from "../components/CardView";
import { Metric } from "../components/Metric";
import { StrategyTable } from "../components/StrategyTable";
import { cacheStats, clearAllData, clearStore, deleteSolve, listSolveRecords, listTrainingResults, loadRange, saveRange, saveTrainingResult, type CacheStats, type SolveSummary, type TrainingResult } from "../lib/db";
import { runSolve } from "../lib/solverClient";
import { decodeSpot, encodeSpot } from "../lib/spotUrl";
import { useAppStore } from "../state/store";

const ranks = "AKQJT98765432";
const DEFAULT_BET_TREE = "flop 33,66,125,all-in; turn 66,125,all-in; river 66,150,all-in";
const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"] as const;

export function Dashboard() {
  const result = useAppStore((s) => s.result) ?? solveRiverSpot(100, 66);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [training, setTraining] = useState<TrainingResult[]>([]);
  useEffect(() => {
    void Promise.all([cacheStats(), listTrainingResults()]).then(([nextStats, nextTraining]) => {
      setStats(nextStats);
      setTraining(nextTraining);
    });
  }, []);
  const avgLoss = training.length ? training.reduce((sum, row) => sum + row.evLoss, 0) / training.length : null;
  return (
    <div className="grid">
      <div>
        <h1 className="title">GTO Lab</h1>
        <p className="muted">学習用のブラウザ完結ポーカー解析ワークベンチ。リアルタイム補助用途ではありません。</p>
      </div>
      <div className="grid cols-3">
        <Metric label="Recent exploitability" value={`${result.exploitability.at(-1)!.value.toFixed(2)}% pot`} />
        <Metric label="Average EV loss" value={avgLoss === null ? "No sessions" : `${avgLoss.toFixed(3)}bb`} />
        <Metric label="Saved solves" value={stats?.solves ?? 0} />
      </div>
      <div className="card" style={{ height: 280 }}><Curve data={result.exploitability} /></div>
    </div>
  );
}

export function RangeExplorer() {
  const [game, setGame] = useState<"NLH" | "PLO">("NLH");
  const [ploText, setPloText] = useState("AA**:ds@100, JT98:ds@75, KKQ*:ss@50");
  const ploParse = useMemo(() => {
    try {
      return { rows: parsePloRange(ploText), error: "" };
    } catch (err) {
      return { rows: [], error: err instanceof Error ? err.message : "bad PLO range" };
    }
  }, [ploText]);
  return (
    <div className="grid">
      <h1 className="title">Range Explorer</h1>
      <label className="field">Game<select value={game} onChange={(event) => setGame(event.target.value as "NLH" | "PLO")}><option>NLH</option><option>PLO</option></select></label>
      {game === "NLH" ? <NlhMatrix /> : <PloRangeViews text={ploText} setText={setPloText} rows={ploParse.rows} error={ploParse.error} />}
    </div>
  );
}

function NlhMatrix() {
  return (
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
  );
}

const PLO_CATEGORIES = [
  ["AAxx", "AA**:ds@100", "Premium aces, double suited"],
  ["Rundowns", "JT98:ds@75", "Connected high-card structures"],
  ["Broadway", "AKQJ:ss@65", "High-card single-suited hands"],
  ["Kings", "KKQ*:ss@50", "Strong KK with side-card support"]
] as const;

function PloRangeViews({ text, setText, rows, error }: { text: string; setText: (value: string) => void; rows: { label: string; weight: number }[]; error: string }) {
  return (
    <div className="grid cols-3">
      <div className="card" aria-label="PLO category tree">
        <b>PLO category tree</b>
        <div className="grid" style={{ marginTop: 12 }}>
          {PLO_CATEGORIES.map(([name, syntax, detail]) => (
            <button className="btn" key={name} onClick={() => setText(syntax)}>
              <span>{name}</span><span className="muted"> {detail}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <label className="field">PLO syntax search<textarea aria-label="PLO syntax search" rows={6} value={text} onChange={(event) => setText(event.target.value)} /></label>
        {error ? <p className="error" role="alert">{error}</p> : <p className="muted">{rows.length} parsed terms</p>}
      </div>
      <div className="card" aria-label="PLO hand list">
        <b>PLO hand list</b>
        <div className="grid" style={{ marginTop: 12 }}>
          {rows.map((row) => <div className="row" key={row.label}><span className="num">{row.label}</span><span>{Math.round(row.weight * 100)}%</span></div>)}
        </div>
      </div>
    </div>
  );
}

export function SolverStudio() {
  const shared = decodeSpot(new URLSearchParams(window.location.search).get("spot"));
  const defaultPrecision = useAppStore((s) => s.precision);
  const [game, setGame] = useState<Game>(shared?.game ?? "NLH");
  const [position, setPosition] = useState(shared?.position ?? "BTN");
  const [villainPosition, setVillainPosition] = useState(shared?.villainPosition ?? "BB");
  const [potType, setPotType] = useState(shared?.potType ?? "SRP");
  const [precision, setPrecision] = useState(shared?.precision ?? defaultPrecision);
  const [pot, setPot] = useState(shared?.pot ?? 100);
  const [bet, setBet] = useState(shared?.bet ?? 66);
  const [stack, setStack] = useState(shared?.stack ?? 420);
  const [rakePct, setRakePct] = useState(shared?.rakePct ?? 0);
  const [rakeCap, setRakeCap] = useState(shared?.rakeCap ?? 0);
  const [board, setBoard] = useState(shared?.board ?? "Ah Kd 7c");
  const [betTree, setBetTree] = useState(shared?.betTree ?? DEFAULT_BET_TREE);
  const [progress, setProgress] = useState<{ iteration: number; value: number }[]>([]);
  const [cached, setCached] = useState(false);
  const [running, setRunning] = useState(false);
  const [resultKey, setResultKey] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("root");
  const cancelRef = useRef<AbortController | null>(null);
  const result = useAppStore((s) => s.result);
  const setResult = useAppStore((s) => s.setResult);
  const currentKey = JSON.stringify({ game, position, villainPosition, potType, precision, pot, bet, stack, board, rakePct, rakeCap, betTree });
  const preview = useMemo(() => {
    try {
      validateSolverInputs(game, pot, bet, stack, board, rakePct, rakeCap, betTree);
      if (game === "NLH" && board.trim()) return { result: null, error: "" };
      return { result: solveRiverSpot(pot, bet, stack, board, rakePct, rakeCap, game, betTree, precision), error: "" };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : "invalid spot" };
    }
  }, [game, pot, bet, stack, board, rakePct, rakeCap, betTree]);
  const shown = preview.error ? null : result && resultKey === currentKey ? result : preview.result;
  const selectedNode = shown?.nodes.find((node) => node.id === selectedNodeId) ?? shown?.nodes[0];
  const shownRows = shown && selectedNode ? rowsForNode(shown, selectedNode) : [];
  const nodeSummary = summarizeRows(shownRows);
  return (
    <div className="split">
      <section className="card grid">
        <h1 className="title">Solver Studio</h1>
        <label className="field">Game<select value={game} onChange={(e) => setGame(e.target.value as Game)}><option>NLH</option><option>PLO4</option><option>PLO5</option></select></label>
        <div className="grid cols-3">
          <label className="field">Hero position<select value={position} onChange={(e) => setPosition(e.target.value as typeof POSITIONS[number])}>{POSITIONS.map((pos) => <option key={pos}>{pos}</option>)}</select></label>
          <label className="field">Villain position<select value={villainPosition} onChange={(e) => setVillainPosition(e.target.value as typeof POSITIONS[number])}>{POSITIONS.map((pos) => <option key={pos}>{pos}</option>)}</select></label>
          <label className="field">Pot type<select value={potType} onChange={(e) => setPotType(e.target.value as "SRP" | "3bet" | "4bet")}><option>SRP</option><option>3bet</option><option>4bet</option></select></label>
        </div>
        <label className="field">Precision<select value={precision} onChange={(e) => setPrecision(e.target.value as "fast" | "balanced" | "precise")}><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="precise">Precise</option></select></label>
        <label className="field">Pot<input type="number" min="1" value={pot} onChange={(e) => setPot(Number(e.target.value))} /></label>
        <label className="field">Bet amount<input type="number" min="0" value={bet} onChange={(e) => setBet(Number(e.target.value))} /></label>
        <label className="field">Stack<input type="number" min="1" value={stack} onChange={(e) => setStack(Number(e.target.value))} /></label>
        <label className="field">Rake %<input type="number" min="0" max="100" step="0.1" value={rakePct} onChange={(e) => setRakePct(Number(e.target.value))} /></label>
        <label className="field">Rake cap<input type="number" min="0" step="0.1" value={rakeCap} onChange={(e) => setRakeCap(Number(e.target.value))} /></label>
        <label className="field">Board<input value={board} onChange={(e) => setBoard(e.target.value)} /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setBoard(randomFlop())}>Random flop</button>
          <button className="btn" onClick={() => setBoard("As Ks 7s")}>Monotone</button>
          <button className="btn" onClick={() => setBoard("Ah Ad 7c")}>Paired</button>
        </div>
        <label className="field">Bet tree<textarea rows={3} value={betTree} onChange={(e) => setBetTree(e.target.value)} /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {flopBetSizes(betTree, pot, bet, stack, game).map((size) => <button className="btn" key={size.amount} onClick={() => setBet(size.amount)}>{size.label}</button>)}
        </div>
        {preview.error ? <p className="error" role="alert">{preview.error}</p> : null}
        <button className="btn primary" disabled={!!preview.error || running} onClick={() => {
          if (preview.error || running || cancelRef.current) return;
          const controller = new AbortController();
          cancelRef.current = controller;
          setRunning(true);
          setProgress([]);
          setCached(false);
          const payload = { game, position, villainPosition, potType, precision, pot, bet, stack, board, rakePct, rakeCap, betTree };
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
        {selectedNode ? <p className="muted">Node: <span className="num">{selectedNode.id}</span></p> : null}
        {shown ? <StrategyTable rows={shownRows} /> : <p className="muted">Fix spot inputs to preview strategy.</p>}
      </section>
      <section className="grid">
        {shown ? <>
          <Metric label="MDF" value={`${(shown.metrics.mdf * 100).toFixed(1)}%`} />
          <Metric label="SPR" value={shown.metrics.spr.toFixed(2)} />
          <Metric label="Bluff breakeven alpha" value={`${(shown.metrics.alpha * 100).toFixed(1)}%`} />
          <Metric label="Pot odds" value={`${(shown.metrics.potOdds * 100).toFixed(1)}%`} />
          {shown.metrics.brGapPctPot !== undefined ? <Metric label="BR gap" value={`${shown.metrics.brGapPctPot.toFixed(2)}% pot`} /> : null}
          {shown.metrics.ploFastExploitability !== undefined ? <Metric label="PLO Fast BR" value={`${shown.metrics.ploFastExploitability.toFixed(2)}% pot`} /> : null}
          <Metric label="Range EV" value={`${nodeSummary.ev.toFixed(3)}bb`} />
          <Metric label="Range Equity" value={`${(nodeSummary.equity * 100).toFixed(1)}%`} />
          <Metric label="Range EQR" value={nodeSummary.eqr.toFixed(2)} />
          <Metric label="Action mix" value={`F ${(nodeSummary.fold * 100).toFixed(0)} / C ${(nodeSummary.call * 100).toFixed(0)} / R ${(nodeSummary.raise * 100).toFixed(0)}`} />
          <div className="card" aria-label="solve nodes"><b>Nodes</b><div className="grid" style={{ gap: 8, marginTop: 12 }}>{shown.nodes.map((node) => <button className="btn" key={node.id} aria-pressed={(selectedNode?.id ?? "root") === node.id} onClick={() => setSelectedNodeId(node.id)}>{node.label} ({node.id}{node.actions.length ? `: ${node.actions.join(", ")}` : ""})</button>)}</div></div>
          <div className="card" style={{ height: 220 }}><Curve data={progress.length ? progress : shown.exploitability} /></div>
        </> : <div className="card"><p className="muted">No valid spot.</p></div>}
      </section>
    </div>
  );
}

function rowsForNode(result: SolveResult, node: SolveNode): SolverRow[] {
  if (node.id === "root") return result.rows;
  if (node.id === "root/fold") return result.rows.map((row) => actionRow(row, "fold", row.foldEv));
  if (node.id === "root/call") return result.rows.map((row) => actionRow(row, "call", row.callEv));
  if (node.id === "root/raise") return result.rows.map((row) => actionRow(row, "raise", row.raiseEv));
  if (node.amount !== undefined && node.pot !== undefined) return result.rows.map((row) => betResponseRow(row, node.pot!, node.amount!));
  return [];
}

function actionRow(row: SolverRow, action: "fold" | "call" | "raise", ev: number): SolverRow {
  return { ...row, fold: action === "fold" ? 1 : 0, call: action === "call" ? 1 : 0, raise: action === "raise" ? 1 : 0, ev, eqr: ev / rowEqrDenominator(row) };
}

function betResponseRow(row: SolverRow, pot: number, amount: number): SolverRow {
  const fold = amount / (pot + amount);
  const call = pot / (pot + amount);
  const callEv = (row.equity * (pot + amount) - (1 - row.equity) * amount) / 100;
  const ev = (fold * pot + call * callEv * 100) / 100;
  return { ...row, fold, call, raise: 0, foldEv: pot / 100, callEv, raiseEv: 0, ev, eqr: ev / Math.max(0.0001, row.equity * pot / 100) };
}

function rowEqrDenominator(row: SolverRow): number {
  return Math.max(0.0001, row.eqr === 0 ? row.equity : row.ev / row.eqr);
}

function summarizeRows(rows: SolverRow[]): Pick<SolverRow, "fold" | "call" | "raise" | "ev" | "equity" | "eqr"> {
  if (!rows.length) return { fold: 0, call: 0, raise: 0, ev: 0, equity: 0, eqr: 0 };
  const total = rows.reduce((sum, row) => ({
    fold: sum.fold + row.fold,
    call: sum.call + row.call,
    raise: sum.raise + row.raise,
    ev: sum.ev + row.ev,
    equity: sum.equity + row.equity,
    eqr: sum.eqr + row.eqr
  }), { fold: 0, call: 0, raise: 0, ev: 0, equity: 0, eqr: 0 });
  return {
    fold: total.fold / rows.length,
    call: total.call / rows.length,
    raise: total.raise / rows.length,
    ev: total.ev / rows.length,
    equity: total.equity / rows.length,
    eqr: total.eqr / rows.length
  };
}

function flopBetSizes(text: string, pot: number, call: number, stack: number, game: Game): { amount: number; label: string }[] {
  try {
    const tree = parseBetTree(text);
    const amounts = game === "NLH" ? concreteBets(tree.flop, pot, stack) : concretePotLimitBets(tree.flop, pot, call, stack);
    return amounts.map((amount) => ({ amount, label: amount === stack ? "All-in" : `${Math.round(amount / pot * 100)}% pot` }));
  } catch {
    return [];
  }
}

function randomFlop(): string {
  return [...deck()].sort(() => Math.random() - 0.5).slice(0, 3).map(formatCard).join(" ");
}

function validateSolverInputs(game: Game, pot: number, bet: number, stack: number, board: string, rakePct: number, rakeCap: number, betTree: string): void {
  if (!Number.isFinite(pot) || pot <= 0) throw new Error("pot must be positive");
  if (!Number.isFinite(bet) || bet < 0) throw new Error("bet must be non-negative");
  if (!Number.isFinite(stack) || stack <= 0) throw new Error("stack must be positive");
  if (!Number.isFinite(rakePct) || rakePct < 0 || rakePct > 100) throw new Error("rake percent must be 0-100");
  if (!Number.isFinite(rakeCap) || rakeCap < 0) throw new Error("rake cap must be non-negative");
  if (!flopBetSizes(betTree, pot, bet, stack, game).length) parseBetTree(betTree);
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
      const parsedPlayers = players.map((p) => ({ cards: parse(p) }));
      const parsedBoard = parse(board);
      const parsedDead = parse(dead);
      const estimate = estimateEquityEvaluations(parsedPlayers, parsedBoard, game, parsedDead);
      const autoExact = estimate <= EXACT_EQUITY_EVAL_THRESHOLD;
      const samples = mode === "exact" ? 0 : mode === "mc" ? Math.max(1, iterations) : board.trim() ? 0 : Math.max(1, iterations);
      return { rows: equity(parsedPlayers, parsedBoard, game, samples, 11, parsedDead), error: "", estimate, autoExact };
    } catch (err) {
      return { rows: [], error: err instanceof Error ? err.message : "invalid equity input", estimate: 0, autoExact: false };
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
      {!calc.error ? <p className="muted">Auto: {calc.autoExact ? "Exact" : "MC"} by {calc.estimate.toLocaleString()} estimated evaluations.</p> : null}
      <div className="grid cols-3">
        {calc.rows.map((r, i) => <Metric key={i} label={`Player ${i + 1}`} value={`Eq ${(r.equity * 100).toFixed(2)}% / W ${(r.win * 100).toFixed(2)}% / T ${(r.tie * 100).toFixed(2)}% / CI ± ${(r.ci95 * 100).toFixed(2)}`} />)}
      </div>
      {calc.rows[0] ? <div className="card" aria-label="Player 1 hand distribution">
        <h2 className="title">Hand distribution</h2>
        <div className="grid">
          {HAND_CATEGORIES.map((label, i) => <div className="hist-row" key={label}>
            <span>{label}</span>
            <i style={{ width: `${calc.rows[0]!.handDistribution[i]! * 100}%` }} />
            <b className="num">{(calc.rows[0]!.handDistribution[i]! * 100).toFixed(1)}%</b>
          </div>)}
        </div>
      </div> : null}
      <div className="cards">{cards.map((c) => <CardView key={c} card={c} />)}</div>
    </div>
  );
}

export function Trainer() {
  const spot = useMemo(() => solveNlhComboSpot(100, 66, 420, "Ah Kd 7c", "AcAd"), []);
  const node = spot.nodes[0]!;
  const row = spot.rows[0]!;
  const bestEv = Math.max(row.foldEv, row.callEv, row.raiseEv);
  const [choice, setChoice] = useState<"fold" | "call" | "raise" | null>(null);
  const [history, setHistory] = useState<TrainingResult[]>([]);
  const answer = (action: "fold" | "call" | "raise") => {
    const ev = action === "fold" ? row.foldEv : action === "call" ? row.callEv : row.raiseEv;
    const evLoss = bestEv - ev;
    const nextGrade = gradeForLoss(evLoss);
    setChoice(action);
    void saveTrainingResult({ spot: "BTN vs BB SRP Ah Kd 7c", nodeId: node.id, street: node.street, hand: row.combo, action, evLoss, grade: nextGrade })
      .then(() => listTrainingResults())
      .then(setHistory);
  };
  useEffect(() => {
    void listTrainingResults().then(setHistory);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if (key === "f" || key === "x") answer("fold");
      if (key === "c") answer("call");
      if (key === "b" || key === "r") answer("raise");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bestEv, node.id, node.street, row.callEv, row.combo, row.foldEv, row.raiseEv]);
  const chosenEv = choice === "fold" ? row.foldEv : choice === "call" ? row.callEv : choice === "raise" ? row.raiseEv : null;
  const loss = chosenEv === null ? null : bestEv - chosenEv;
  const grade = loss === null ? "Choose an action" : gradeForLoss(loss);
  const avgLoss = history.length ? history.reduce((sum, result) => sum + result.evLoss, 0) / history.length : null;
  return (
    <div className="grid">
      <h1 className="title">Trainer</h1>
      <div className="card">
        <p className="muted">BTN vs BB, SRP, flop Ah Kd 7c. Hero: Ac Ad.</p>
        <div className="cards"><CardView card={parseCard("Ac")} /><CardView card={parseCard("Ad")} /><CardView card={parseCard("Ah")} /><CardView card={parseCard("Kd")} /><CardView card={parseCard("7c")} /></div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}><button className="btn" onClick={() => answer("fold")}>Fold</button><button className="btn" onClick={() => answer("call")}>Call</button><button className="btn primary" onClick={() => answer("raise")}>Bet 66%</button></div>
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          <Metric label="EV loss" value={loss === null ? "-" : `${loss.toFixed(3)}bb`} />
          <Metric label="Grade" value={grade} />
          <Metric label="GTO raise" value={`${(row.raise * 100).toFixed(0)}%`} />
        </div>
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          <Metric label="Attempts" value={history.length} />
          <Metric label="Average loss" value={avgLoss === null ? "-" : `${avgLoss.toFixed(3)}bb`} />
          <Metric label="Last action" value={history[0]?.action ?? "-"} />
          <Metric label="Node" value={history[0]?.nodeId ?? node.id} />
          <Metric label="Street" value={history[0]?.street ?? node.street} />
        </div>
      </div>
    </div>
  );
}

function gradeForLoss(loss: number): string {
  return loss <= 0.005 ? "Perfect" : loss <= 0.05 ? "Good" : loss <= 0.2 ? "Inaccuracy" : "Blunder";
}

export function RangeEditor() {
  const [text, setText] = useState("AA, KQs, A5s:0.5");
  const [jsonText, setJsonText] = useState(rangeJson("AA, KQs, A5s:0.5"));
  const [status, setStatus] = useState("ready");
  useEffect(() => {
    void loadRange("default").then((saved) => {
      if (saved) {
        setText(saved);
        setJsonText(rangeJson(saved));
      }
    });
  }, []);
  const parsed = useMemo(() => {
    try { return serializeRange(parseNlhRange(text)); } catch { return "Invalid range"; }
  }, [text]);
  const plo = useMemo(() => parsePloRange("AA**:ds@100, AA**:ss@60").map((r) => `${r.label} ${r.weight}`).join(" / "), []);
  const updateText = (next: string) => {
    setText(next);
    setJsonText(rangeJson(next));
  };
  const importJson = () => {
    try {
      const next = parseRangeJson(jsonText);
      setText(next);
      setJsonText(rangeJson(next));
      setStatus("imported");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "invalid JSON");
    }
  };
  return (
    <div className="grid">
      <h1 className="title">Range Editor</h1>
      <textarea aria-label="Range text" className="card" value={text} onChange={(e) => updateText(e.target.value)} rows={5} />
      <textarea aria-label="Range JSON" className="card" value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={5} />
      <button className="btn primary" onClick={() => void saveRange("default", text).then(() => setStatus("saved"))}>Save</button>
      <button className="btn" onClick={importJson}>Import JSON</button>
      <div className="card"><b>Round trip</b><p className="num">{parsed}</p><p className="muted">PLO sample: {plo}</p><p>{status}</p></div>
    </div>
  );
}

function rangeJson(text: string): string {
  return JSON.stringify({ version: 1, kind: "range", payload: { text } }, null, 2);
}

function parseRangeJson(raw: string): string {
  const doc = JSON.parse(raw) as { version?: unknown; kind?: unknown; payload?: { text?: unknown } };
  if (doc.version !== 1 || doc.kind !== "range" || typeof doc.payload?.text !== "string") throw new Error("invalid range JSON");
  return doc.payload.text;
}

export function Settings() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [solves, setSolves] = useState<SolveSummary[]>([]);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const deckColors = useAppStore((s) => s.deckColors);
  const setDeckColors = useAppStore((s) => s.setDeckColors);
  const precision = useAppStore((s) => s.precision);
  const setPrecision = useAppStore((s) => s.setPrecision);
  const refresh = () => void Promise.all([cacheStats(), listSolveRecords()]).then(([nextStats, nextSolves]) => {
    setStats(nextStats);
    setSolves(nextSolves);
  });
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
        {solves.length ? <div className="grid" aria-label="Solve cache entries">
          {solves.slice(0, 5).map((solve) => <div className="row" key={solve.key}>
            <span className="num">{solve.key.slice(0, 12)}</span>
            <span className="muted">{formatSpotSummary(solve.spot)}</span>
            <button className="btn" onClick={() => void deleteSolve(solve.key).then(refresh)}>Delete solve</button>
          </div>)}
        </div> : null}
      </div>
    </div>
  );
}

function formatSpotSummary(spot: unknown): string {
  if (!spot || typeof spot !== "object") return "spot";
  const rec = spot as Record<string, unknown>;
  return `${rec.game ?? "NLH"} ${rec.pot ?? "?"}/${rec.bet ?? "?"}`;
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
