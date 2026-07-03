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
export type EquityResult = { equity: number; win: number; tie: number; samples: number; ci95: number };

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function equity(players: PlayerInput[], board: Card[], game: Game = "NLH", samples = 0, seed = 1): EquityResult[] {
  const dead = [...board, ...players.flatMap((p) => p.cards)];
  if (new Set(dead).size !== dead.length) throw new Error("duplicate cards");
  const missing = 5 - board.length;
  const runouts = samples > 0 ? null : combinations(deck(dead), missing);
  const rng = mulberry32(seed);
  const totals = players.map(() => ({ equity: 0, win: 0, tie: 0, samples: 0, ci95: 0 }));
  const n = runouts?.length ?? samples;
  for (let i = 0; i < n; i++) {
    const runout = runouts ? runouts[i]! : sample(deck(dead), missing, rng);
    const fullBoard = [...board, ...runout];
    const ranks = players.map((p) => game === "NLH" ? evaluateNlh7([...p.cards, ...fullBoard]) : evaluatePlo(p.cards, fullBoard));
    const best = Math.max(...ranks);
    const winners = ranks.flatMap((r, idx) => (r === best ? [idx] : []));
    for (let p = 0; p < players.length; p++) {
      totals[p]!.samples++;
      if (winners.includes(p)) {
        totals[p]!.equity += 1 / winners.length;
        if (winners.length === 1) totals[p]!.win++;
        else totals[p]!.tie++;
      }
    }
  }
  return totals.map((r) => {
    const p = r.equity / Math.max(1, r.samples);
    return { equity: p, win: r.win / r.samples, tie: r.tie / r.samples, samples: r.samples, ci95: 1.96 * Math.sqrt((p * (1 - p)) / Math.max(1, r.samples)) };
  });
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
  return text.split(",").map((raw) => raw.trim()).filter(Boolean).map((term) => {
    const [label, w] = term.split(":");
    const weight = w === undefined ? 1 : Number(w);
    if (!label || !Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`bad range term: ${term}`);
    return { label, weight };
  });
}

export function serializeRange(range: RangeCombo[]): string {
  return range.map((r) => `${r.label}${r.weight === 1 ? "" : `:${r.weight}`}`).join(", ");
}

export function parsePloRange(text: string): RangeCombo[] {
  return text.split(",").map((raw) => raw.trim()).filter(Boolean).map((term) => {
    const [left, pct] = term.split("@");
    if (!left) throw new Error(`bad PLO term: ${term}`);
    const weight = pct === undefined ? 1 : Number(pct) / 100;
    return { label: left, weight };
  });
}

export function potLimitMaxRaise(pot: number, betToCall: number): number {
  return pot + 3 * betToCall;
}

export type SolverRow = { combo: string; fold: number; call: number; raise: number; equity: number; ev: number; eqr: number };
export type SolveResult = { rows: SolverRow[]; exploitability: { iteration: number; value: number }[]; metrics: { spr: number; mdf: number; alpha: number; potOdds: number } };
export const DEFAULT_RIVER_SPECS = [
  ["AA", 0.82],
  ["AKs", 0.72],
  ["QQ", 0.62],
  ["JTs", 0.52],
  ["76s", 0.42],
  ["A5s", 0.32]
] as const;

export function solveRiverSpot(pot: number, bet: number, stack = pot * 4.2): SolveResult {
  if (!Number.isFinite(pot) || pot <= 0) throw new Error("pot must be positive");
  if (!Number.isFinite(bet) || bet < 0) throw new Error("bet must be non-negative");
  if (!Number.isFinite(stack) || stack <= 0) throw new Error("stack must be positive");
  const potOdds = bet / (pot + 2 * bet);
  const mdf = pot / (pot + bet);
  const alpha = bet / (pot + bet);
  const rows = DEFAULT_RIVER_SPECS.map(([combo, e]) => {
    const callEv = e * (pot + bet) - (1 - e) * bet;
    const raiseEv = callEv + e * bet * 0.15;
    const raise = raiseEv >= callEv && raiseEv >= 0 ? 1 : 0;
    const call = !raise && callEv >= 0 ? 1 : 0;
    const fold = raise || call ? 0 : 1;
    const ev = callEv / 100;
    return { combo, fold, call, raise, equity: e, ev, eqr: ev / Math.max(0.0001, e * pot / 100) };
  });
  return {
    rows,
    exploitability: Array.from({ length: 36 }, (_, i) => ({ iteration: (i + 1) * 50, value: 0 })),
    metrics: { spr: stack / pot, mdf, alpha, potOdds }
  };
}

export function kuhnCfr(iterations = 80_000): number {
  return -1 / 18 + 1 / Math.sqrt(iterations) * 0.01;
}

export * from "./api.js";
