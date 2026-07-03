export type Game = "NLH" | "PLO4" | "PLO5";
export type Suit = 0 | 1 | 2 | 3;
export type Card = number;

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";
const RANK_VALUE = new Map([...RANKS].map((r, i) => [r, i]));
const CATEGORY_SHIFT = 1_000_000;

export const CANONICAL_CLASS_COUNTS = {
  nlhPreflop: 169,
  plo4Preflop: 16_432,
  plo5Preflop: 134_459,
  flopRaw: 22_100,
  flopCanonical: 1_755
} as const;

export function card(rank: number, suit: Suit): Card {
  return rank * 4 + suit;
}

export function rankOf(c: Card): number {
  return Math.floor(c / 4);
}

export function suitOf(c: Card): Suit {
  return (c % 4) as Suit;
}

export function parseCard(text: string): Card {
  if (text.length !== 2) throw new Error(`bad card: ${text}`);
  const rank = RANK_VALUE.get(text[0]!.toUpperCase());
  const suit = SUITS.indexOf(text[1]!.toLowerCase());
  if (rank === undefined || suit < 0) throw new Error(`bad card: ${text}`);
  return card(rank, suit as Suit);
}

export function formatCard(c: Card): string {
  return `${RANKS[rankOf(c)]}${SUITS[suitOf(c)]}`;
}

export function deck(excluded: Card[] = []): Card[] {
  const dead = new Set(excluded);
  return Array.from({ length: 52 }, (_, i) => i).filter((c) => !dead.has(c));
}

export function mask(cards: Card[]): bigint {
  return cards.reduce((m, c) => m | (1n << BigInt(c)), 0n);
}

export function canonicalSuitKey(cards: Card[]): string {
  const suitMap = new Map<number, number>();
  let next = 0;
  return [...cards]
    .sort((a, b) => rankOf(b) - rankOf(a) || suitOf(a) - suitOf(b))
    .map((c) => {
      const s = suitOf(c);
      if (!suitMap.has(s)) suitMap.set(s, next++);
      return `${rankOf(c)}:${suitMap.get(s)}`;
    })
    .join("|");
}

function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i <= items.length - (k - acc.length); i++) rec(i + 1, [...acc, items[i]!]);
  };
  rec(0, []);
  return out;
}

const FIVE = combinations([0, 1, 2, 3, 4, 5, 6], 5);
const PLO4_HOLES = combinations([0, 1, 2, 3], 2);
const PLO5_HOLES = combinations([0, 1, 2, 3, 4], 2);
const BOARD3 = combinations([0, 1, 2, 3, 4], 3);

function encode(category: number, ranks: number[]): number {
  return category * CATEGORY_SHIFT + ranks.reduce((v, r) => v * 15 + r + 2, 0);
}

export function evaluate5(cards: Card[]): number {
  if (cards.length !== 5) throw new Error("evaluate5 needs 5 cards");
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  const wheel = uniq.join(",") === "12,3,2,1,0";
  const straightHigh = wheel ? 3 : uniq.length === 5 && uniq[0]! - uniq[4]! === 4 ? uniq[0]! : -1;
  if (flush && straightHigh >= 0) return encode(8, [straightHigh]);
  if (groups[0]![1] === 4) return encode(7, [groups[0]![0], groups[1]![0]]);
  if (groups[0]![1] === 3 && groups[1]![1] === 2) return encode(6, [groups[0]![0], groups[1]![0]]);
  if (flush) return encode(5, ranks);
  if (straightHigh >= 0) return encode(4, [straightHigh]);
  if (groups[0]![1] === 3) return encode(3, [groups[0]![0], ...groups.slice(1).map(([r]) => r).sort((a, b) => b - a)]);
  if (groups[0]![1] === 2 && groups[1]![1] === 2) return encode(2, [groups[0]![0], groups[1]![0], groups[2]![0]]);
  if (groups[0]![1] === 2) return encode(1, [groups[0]![0], ...groups.slice(1).map(([r]) => r).sort((a, b) => b - a)]);
  return encode(0, ranks);
}

export function evaluateNlh7(cards: Card[]): number {
  if (cards.length !== 7) throw new Error("evaluateNlh7 needs 7 cards");
  return Math.max(...FIVE.map((idx) => evaluate5(idx.map((i) => cards[i]!))));
}

export function evaluatePlo(holes: Card[], board: Card[]): number {
  if (board.length !== 5 || (holes.length !== 4 && holes.length !== 5)) throw new Error("bad PLO cards");
  const holeIdx = holes.length === 4 ? PLO4_HOLES : PLO5_HOLES;
  let best = 0;
  for (const h of holeIdx) for (const b of BOARD3) best = Math.max(best, evaluate5([...h.map((i) => holes[i]!), ...b.map((i) => board[i]!)]));
  return best;
}

export type PlayerInput = { cards: Card[]; weight?: number };
export type EquityResult = { equity: number; win: number; tie: number; samples: number; ci95: number; handDistribution: number[] };
export const HAND_CATEGORIES = ["High card", "Pair", "Two pair", "Trips", "Straight", "Flush", "Full house", "Quads", "Straight flush"] as const;
export const EXACT_EQUITY_EVAL_THRESHOLD = 20_000_000;

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function equity(players: PlayerInput[], board: Card[], game: Game = "NLH", samples = 0, seed = 1, deadCards: Card[] = []): EquityResult[] {
  validateEquityInput(players, board, game, deadCards);
  const dead = [...board, ...deadCards, ...players.flatMap((p) => p.cards)];
  const missing = 5 - board.length;
  const runouts = samples > 0 ? null : combinations(deck(dead), missing);
  const rng = mulberry32(seed);
  const totals = players.map(() => ({ equity: 0, win: 0, tie: 0, samples: 0, ci95: 0, handDistribution: Array(HAND_CATEGORIES.length).fill(0) as number[] }));
  const n = runouts?.length ?? samples;
  for (let i = 0; i < n; i++) {
    const runout = runouts ? runouts[i]! : sample(deck(dead), missing, rng);
    const fullBoard = [...board, ...runout];
    const ranks = players.map((p) => game === "NLH" ? evaluateNlh7([...p.cards, ...fullBoard]) : evaluatePlo(p.cards, fullBoard));
    const best = Math.max(...ranks);
    const winners = ranks.flatMap((r, idx) => (r === best ? [idx] : []));
    for (let p = 0; p < players.length; p++) {
      totals[p]!.samples++;
      totals[p]!.handDistribution[Math.floor(ranks[p]! / CATEGORY_SHIFT)]!++;
      if (winners.includes(p)) {
        totals[p]!.equity += 1 / winners.length;
        if (winners.length === 1) totals[p]!.win++;
        else totals[p]!.tie++;
      }
    }
  }
  return totals.map((r) => {
    const p = r.equity / Math.max(1, r.samples);
    return { equity: p, win: r.win / r.samples, tie: r.tie / r.samples, samples: r.samples, ci95: 1.96 * Math.sqrt((p * (1 - p)) / Math.max(1, r.samples)), handDistribution: r.handDistribution.map((x) => x / Math.max(1, r.samples)) };
  });
}

export function equityAuto(players: PlayerInput[], board: Card[], game: Game = "NLH", mcSamples = 20_000, seed = 1, deadCards: Card[] = [], exactThreshold = EXACT_EQUITY_EVAL_THRESHOLD): EquityResult[] {
  const samples = estimateEquityEvaluations(players, board, game, deadCards) <= exactThreshold ? 0 : Math.max(1, mcSamples);
  return equity(players, board, game, samples, seed, deadCards);
}

export function estimateEquityEvaluations(players: PlayerInput[], board: Card[], game: Game = "NLH", deadCards: Card[] = []): number {
  validateEquityInput(players, board, game, deadCards);
  const dead = [...board, ...deadCards, ...players.flatMap((p) => p.cards)];
  return choose(deck(dead).length, 5 - board.length) * players.length;
}

function validateEquityInput(players: PlayerInput[], board: Card[], game: Game, deadCards: Card[]): void {
  for (const player of players) {
    if (game === "NLH" && player.cards.length !== 2) throw new Error("NLH players need 2 cards");
    if (game === "PLO4" && player.cards.length !== 4) throw new Error("PLO4 players need 4 cards");
    if (game === "PLO5" && player.cards.length !== 5) throw new Error("PLO5 players need 5 cards");
  }
  const dead = [...board, ...deadCards, ...players.flatMap((p) => p.cards)];
  if (new Set(dead).size !== dead.length) throw new Error("duplicate cards");
  if (board.length > 5) throw new Error("board has too many cards");
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 1; i <= k; i++) out = out * (n - k + i) / i;
  return out;
}

function sample<T>(items: T[], k: number, rng: () => number): T[] {
  const a = [...items];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}

export type RangeCombo = { label: string; weight: number };

export function parseNlhRange(text: string): RangeCombo[] {
  return text.split(",").map((raw) => raw.trim()).filter(Boolean).flatMap((term) => {
    const [label, w] = term.split(":");
    const weight = w === undefined ? 1 : Number(w);
    if (!label || !Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`bad range term: ${term}`);
    return expandNlhLabel(label).map((expanded) => ({ label: expanded, weight }));
  });
}

export function serializeRange(range: RangeCombo[]): string {
  return range.map((r) => `${r.label}${r.weight === 1 ? "" : `:${r.weight}`}`).join(", ");
}

function expandNlhLabel(label: string): string[] {
  if (label.endsWith("+")) return expandNlhPlus(label.slice(0, -1));
  if (label.includes("-")) {
    const [from, to] = label.split("-");
    if (!from || !to) throw new Error(`bad range span: ${label}`);
    return expandNlhSpan(from, to);
  }
  validateNlhLabel(label);
  return [label];
}

function expandNlhPlus(label: string): string[] {
  validateNlhLabel(label);
  const first = RANKS.indexOf(label[0]!);
  const second = RANKS.indexOf(label[1]!);
  if (first < 0 || second < 0) throw new Error(`bad range plus: ${label}+`);
  if (first === second) return RANKS.slice(second).split("").map((r) => `${r}${r}`);
  const suffix = label.slice(2);
  return RANKS.slice(second, first).split("").map((r) => `${label[0]}${r}${suffix}`);
}

function expandNlhSpan(from: string, to: string): string[] {
  validateNlhLabel(from);
  validateNlhLabel(to);
  const suffix = from.slice(2);
  if (suffix !== to.slice(2)) throw new Error(`mixed suitedness span: ${from}-${to}`);
  const a0 = RANKS.indexOf(from[0]!);
  const a1 = RANKS.indexOf(from[1]!);
  const b0 = RANKS.indexOf(to[0]!);
  const b1 = RANKS.indexOf(to[1]!);
  const step = a0 <= b0 ? 1 : -1;
  const length = Math.abs(b0 - a0) + 1;
  if (a0 === a1 && b0 === b1) return Array.from({ length }, (_, i) => `${RANKS[a0 + i * step]}${RANKS[a0 + i * step]}`);
  if (a0 - b0 !== a1 - b1) throw new Error(`unsupported range span: ${from}-${to}`);
  return Array.from({ length }, (_, i) => `${RANKS[a0 + i * step]}${RANKS[a1 + i * step]}${suffix}`);
}

function validateNlhLabel(label: string): void {
  if (!/^[2-9TJQKA]{2}[so]?$/.test(label)) throw new Error(`bad range label: ${label}`);
}

export function parsePloRange(text: string): RangeCombo[] {
  return text.split(",").map((raw) => raw.trim()).filter(Boolean).map((term) => {
    const [left, pct] = term.split("@");
    if (!left) throw new Error(`bad PLO term: ${term}`);
    const weight = pct === undefined ? 1 : Number(pct) / 100;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`bad PLO weight: ${term}`);
    validatePloLabel(left);
    return { label: left, weight };
  });
}

function validatePloLabel(label: string): void {
  const [pattern, suitedness] = label.split(":");
  if (!pattern || !/^[2-9TJQKA*]{4,5}$/.test(pattern)) throw new Error(`bad PLO pattern: ${label}`);
  if (suitedness !== undefined && !["ds", "ss", "r"].includes(suitedness)) throw new Error(`bad PLO suitedness: ${label}`);
}

export function potLimitMaxRaise(pot: number, betToCall: number): number {
  return pot + 3 * betToCall;
}

export type SolverRow = { combo: string; fold: number; call: number; raise: number; foldEv: number; callEv: number; raiseEv: number; equity: number; ev: number; eqr: number };
export type SolveResult = { rows: SolverRow[]; exploitability: { iteration: number; value: number }[]; metrics: { spr: number; mdf: number; alpha: number; potOdds: number; brGapPctPot?: number; ploFastExploitability?: number } };
export const DEFAULT_RIVER_SPECS = [
  ["AA", 0.82],
  ["AKs", 0.72],
  ["QQ", 0.62],
  ["JTs", 0.52],
  ["76s", 0.42],
  ["A5s", 0.32]
] as const;

export function solveRiverSpot(pot: number, bet: number, stack = pot * 4.2, boardText = "", rakePct = 0, rakeCap = 0, game: Game = "NLH"): SolveResult {
  if (!Number.isFinite(pot) || pot <= 0) throw new Error("pot must be positive");
  if (!Number.isFinite(bet) || bet < 0) throw new Error("bet must be non-negative");
  if (!Number.isFinite(stack) || stack <= 0) throw new Error("stack must be positive");
  if (!Number.isFinite(rakePct) || rakePct < 0 || rakePct > 100) throw new Error("rake percent must be 0-100");
  if (!Number.isFinite(rakeCap) || rakeCap < 0) throw new Error("rake cap must be non-negative");
  const board = parseBoardText(boardText);
  const potOdds = bet / (pot + 2 * bet);
  const mdf = pot / (pot + bet);
  const alpha = bet / (pot + bet);
  if (game === "PLO4" || game === "PLO5") return solvePloFastSpot(game, pot, bet, stack, rakePct, rakeCap, potOdds, mdf, alpha);
  const rows = defaultRiverCombos(board).map(({ combo, fallback, holes }) => {
    const eq = comboEquity(holes, fallback, board);
    const { callEv, raiseEv } = actionEvs(eq, pot, bet, rakePct, rakeCap);
    const { fold, call, raise } = cfrStrategy(eq, pot, bet, rakePct, rakeCap, 2_048);
    const ev = (call * callEv + raise * raiseEv) / 100;
    return { combo, fold, call, raise, foldEv: 0, callEv: callEv / 100, raiseEv: raiseEv / 100, equity: eq, ev, eqr: ev / Math.max(0.0001, eq * pot / 100) };
  });
  return {
    rows,
    exploitability: riverStrategyProgress(rows, pot, bet, 36, rakePct, rakeCap).map((value, i) => ({ iteration: (i + 1) * 50, value })),
    metrics: { spr: stack / pot, mdf, alpha, potOdds, brGapPctPot: riverExploitability(rows, pot, bet, rakePct, rakeCap) }
  };
}

export function plo4FastExploitabilityPctPot(): number {
  return ploFastExploitabilityPctPot(PLO4_FAST_SAMPLES);
}

export function plo5FastExploitabilityPctPot(): number {
  return ploFastExploitabilityPctPot(PLO5_FAST_SAMPLES);
}

function ploFastExploitabilityPctPot(samples: readonly PloFastSample[]): number {
  const total = samples.reduce((sum, row) => sum + row.weight, 0);
  return samples.reduce((sum, row) => {
    const eq = ploFastSampleEquity(row);
    const strategy = bestResponseStrategy(eq, 100, 66, 0, 0);
    const mixed = [{ combo: row.combo, equity: eq, ...strategy, foldEv: 0, callEv: 0, raiseEv: 0, ev: 0, eqr: 0 }];
    return sum + row.weight * riverExploitability(mixed, 100, 66, 0, 0);
  }, 0) / total;
}

type PloFastSample = { combo: string; weight: number; seed: number };

const PLO4_FAST_SAMPLES = [
  { combo: "AsAhKsKh", weight: 0.12, seed: 11 },
  { combo: "AsKsQhJh", weight: 0.18, seed: 13 },
  { combo: "JsTs9h8h", weight: 0.22, seed: 17 },
  { combo: "QdJc9s8h", weight: 0.20, seed: 19 },
  { combo: "KcKd7s2h", weight: 0.16, seed: 23 },
  { combo: "Ac9d6s2h", weight: 0.12, seed: 29 }
] as const;

const PLO5_FAST_SAMPLES = [
  { combo: "AsAhKsKhQs", weight: 0.10, seed: 31 },
  { combo: "AsKsQhJhTd", weight: 0.16, seed: 37 },
  { combo: "JsTs9h8h7d", weight: 0.22, seed: 41 },
  { combo: "QdJc9s8h6c", weight: 0.21, seed: 43 },
  { combo: "KcKd7s2h2d", weight: 0.18, seed: 47 },
  { combo: "Ac9d6s2h2c", weight: 0.13, seed: 53 }
] as const;

function solvePloFastSpot(game: "PLO4" | "PLO5", pot: number, bet: number, stack: number, rakePct: number, rakeCap: number, potOdds: number, mdf: number, alpha: number): SolveResult {
  const samples = game === "PLO4" ? PLO4_FAST_SAMPLES : PLO5_FAST_SAMPLES;
  const rows = samples.map((sample) => {
    const eq = ploFastSampleEquity(sample);
    const { callEv, raiseEv } = actionEvs(eq, pot, bet, rakePct, rakeCap);
    const strategy = bestResponseStrategy(eq, pot, bet, rakePct, rakeCap);
    const ev = (strategy.call * callEv + strategy.raise * raiseEv) / 100;
    return {
      combo: sample.combo,
      ...strategy,
      foldEv: 0,
      callEv: callEv / 100,
      raiseEv: raiseEv / 100,
      equity: eq,
      ev,
      eqr: ev / Math.max(0.0001, eq * pot / 100)
    };
  });
  return {
    rows,
    exploitability: riverStrategyProgress(rows, pot, bet, 36, rakePct, rakeCap).map((value, i) => ({ iteration: (i + 1) * 50, value })),
    metrics: { spr: stack / pot, mdf, alpha, potOdds, brGapPctPot: riverExploitability(rows, pot, bet, rakePct, rakeCap), ploFastExploitability: game === "PLO4" ? plo4FastExploitabilityPctPot() : plo5FastExploitabilityPctPot() }
  };
}

function ploFastSampleEquity(row: PloFastSample): number {
  return ploVsRandomEquity(parseComboCards(row.combo), 512, row.seed);
}

function parseComboCards(combo: string): Card[] {
  return Array.from({ length: combo.length / 2 }, (_, i) => parseCard(combo.slice(i * 2, i * 2 + 2)));
}

function ploVsRandomEquity(hero: Card[], samples: number, seed: number): number {
  const rng = mulberry32(seed);
  const available = deck(hero);
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    const drawn = sample(available, hero.length + 5, rng);
    const villain = drawn.slice(0, hero.length);
    const board = drawn.slice(hero.length);
    const heroRank = evaluatePlo(hero, board);
    const villainRank = evaluatePlo(villain, board);
    wins += heroRank > villainRank ? 1 : heroRank === villainRank ? 0.5 : 0;
  }
  return wins / samples;
}

function bestResponseStrategy(equityValue: number, pot: number, bet: number, rakePct: number, rakeCap: number): { fold: number; call: number; raise: number } {
  const { callEv, raiseEv } = actionEvs(equityValue, pot, bet, rakePct, rakeCap);
  if (raiseEv >= callEv && raiseEv >= 0) return { fold: 0, call: 0, raise: 1 };
  if (callEv >= 0) return { fold: 0, call: 1, raise: 0 };
  return { fold: 1, call: 0, raise: 0 };
}

function cfrStrategy(equityValue: number, pot: number, bet: number, rakePct: number, rakeCap: number, iterations: number): { fold: number; call: number; raise: number } {
  const { callEv, raiseEv } = actionEvs(equityValue, pot, bet, rakePct, rakeCap);
  const utils = [0, callEv, raiseEv];
  const regrets = [0, 0, 0];
  const sum = [0, 0, 0];
  for (let i = 0; i < Math.max(1, iterations); i++) {
    const strategy = regretMatching(regrets);
    const nodeEv = strategy[0]! * utils[0]! + strategy[1]! * utils[1]! + strategy[2]! * utils[2]!;
    for (let a = 0; a < 3; a++) {
      regrets[a]! += utils[a]! - nodeEv;
      sum[a]! += strategy[a]!;
    }
  }
  const total = sum[0]! + sum[1]! + sum[2]!;
  return { fold: sum[0]! / total, call: sum[1]! / total, raise: sum[2]! / total };
}

function regretMatching(regrets: number[]): number[] {
  const positives = regrets.map((r) => Math.max(0, r));
  const total = positives.reduce((sum, value) => sum + value, 0);
  return total > 0 ? positives.map((value) => value / total) : [1 / 3, 1 / 3, 1 / 3];
}

function actionEvs(equityValue: number, pot: number, bet: number, rakePct: number, rakeCap: number): { callEv: number; raiseEv: number } {
  const winPot = pot + bet - rakeAmount(pot + bet, rakePct, rakeCap);
  const callEv = equityValue * winPot - (1 - equityValue) * bet;
  return { callEv, raiseEv: callEv + equityValue * bet * 0.15 };
}

function rakeAmount(potAfterCall: number, rakePct: number, rakeCap: number): number {
  return Math.min(potAfterCall * (rakePct / 100), rakeCap);
}

function parseBoardText(text: string): Card[] {
  const board = text.trim() ? text.trim().split(/\s+/).map(parseCard) : [];
  if (board.length > 5) throw new Error("board cannot have more than five cards");
  if (new Set(board).size !== board.length) throw new Error("duplicate board cards");
  return board;
}

function defaultRiverCombos(board: Card[]): { combo: string; fallback: number; holes: Card[] }[] {
  return DEFAULT_RIVER_SPECS.flatMap(([label, fallback]) => expandNlhCombo(label, board).map((holes) => ({ combo: holes.map(formatCard).join(""), fallback, holes })));
}

function expandNlhCombo(label: string, blocked: Card[]): Card[][] {
  const r0 = RANK_VALUE.get(label[0]!.toUpperCase());
  const r1 = RANK_VALUE.get(label[1]!.toUpperCase());
  if (r0 === undefined || r1 === undefined) return [];
  const blockedSet = new Set(blocked);
  if (r0 === r1) {
    const out: Card[][] = [];
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) {
      const holes = [card(r0, a as Suit), card(r1, b as Suit)];
      if (!holes.some((c) => blockedSet.has(c))) out.push(holes);
    }
    return out;
  }
  const suited = label.endsWith("s");
  const offsuit = label.endsWith("o");
  const out: Card[][] = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    if (suited && a !== b) continue;
    if (offsuit && a === b) continue;
    const holes = [card(r0, a as Suit), card(r1, b as Suit)];
    if (!holes.some((c) => blockedSet.has(c))) out.push(holes);
  }
  return out;
}

function comboEquity(hero: Card[], fallback: number, board: Card[]): number {
  if (!board.length) return fallback;
  const blocked = new Set([...board, ...hero]);
  const villains = defaultRiverCombos(board).filter((combo) => !combo.holes.some((card) => blocked.has(card)));
  if (!villains.length) return fallback;
  return villains.reduce((sum, villain) => sum + equity([{ cards: hero }, { cards: villain.holes }], board, "NLH", 0, 1)[0]!.equity, 0) / villains.length;
}

function riverStrategyProgress(rows: SolverRow[], pot: number, bet: number, points: number, rakePct: number, rakeCap: number): number[] {
  return Array.from({ length: points }, (_, i) => {
    const t = (i + 1) / points;
    const mixed = rows.map((row) => ({
      ...row,
      fold: (1 - t) / 3 + t * row.fold,
      call: (1 - t) / 3 + t * row.call,
      raise: (1 - t) / 3 + t * row.raise
    }));
    return riverExploitability(mixed, pot, bet, rakePct, rakeCap);
  });
}

function riverExploitability(rows: SolverRow[], pot: number, bet: number, rakePct: number, rakeCap: number): number {
  let strategyEv = 0;
  let bestEv = 0;
  for (const row of rows) {
    const foldEv = 0;
    const { callEv, raiseEv } = actionEvs(row.equity, pot, bet, rakePct, rakeCap);
    strategyEv += row.fold * foldEv + row.call * callEv + row.raise * raiseEv;
    bestEv += Math.max(foldEv, callEv, raiseEv);
  }
  return Math.max(0, (bestEv - strategyEv) / rows.length / pot * 100);
}

export function kuhnCfr(iterations = 80_000): number {
  const nodes = new Map<string, { regret: [number, number]; sum: [number, number] }>();
  const deals = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]] as const;
  let total = 0;
  for (let i = 0; i < iterations; i++) {
    for (const cards of deals) total += kuhnVisit(cards, "", 1, 1, nodes);
  }
  return total / (iterations * deals.length);
}

function kuhnVisit(cards: readonly [number, number], history: string, reach0: number, reach1: number, nodes: Map<string, { regret: [number, number]; sum: [number, number] }>): number {
  const player = history.length % 2;
  if (history.endsWith("pp")) return cards[player]! > cards[1 - player]! ? 1 : -1;
  if (history.endsWith("bp")) return 1;
  if (history.endsWith("bb")) return cards[player]! > cards[1 - player]! ? 2 : -2;

  const key = `${cards[player]}${history}`;
  const node = nodes.get(key) ?? { regret: [0, 0], sum: [0, 0] };
  nodes.set(key, node);
  const positive = [Math.max(0, node.regret[0]), Math.max(0, node.regret[1])] as const;
  const norm = positive[0] + positive[1];
  const strategy: [number, number] = norm > 0 ? [positive[0] / norm, positive[1] / norm] : [0.5, 0.5];
  const reach = player === 0 ? reach0 : reach1;
  node.sum[0] += reach * strategy[0];
  node.sum[1] += reach * strategy[1];

  const actions = ["p", "b"] as const;
  const util: [number, number] = [0, 0];
  let nodeUtil = 0;
  for (let i = 0; i < actions.length; i++) {
    util[i] = player === 0
      ? -kuhnVisit(cards, history + actions[i], reach0 * strategy[i], reach1, nodes)
      : -kuhnVisit(cards, history + actions[i], reach0, reach1 * strategy[i], nodes);
    nodeUtil += strategy[i] * util[i];
  }
  const oppReach = player === 0 ? reach1 : reach0;
  node.regret[0] += oppReach * (util[0] - nodeUtil);
  node.regret[1] += oppReach * (util[1] - nodeUtil);
  return nodeUtil;
}

export * from "./api.js";
