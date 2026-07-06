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

export type BetSize = { kind: "percent"; value: number } | { kind: "all-in" };
export type BetTree = { flop: BetSize[]; turn: BetSize[]; river: BetSize[] };

export function parseBetTree(text: string): BetTree {
  const tree: BetTree = { flop: [], turn: [], river: [] };
  for (const rawPart of text.split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = /^(flop|turn|river)\s+(.+)$/i.exec(part);
    if (!match) throw new Error(`bad bet tree segment: ${part}`);
    tree[match[1]!.toLowerCase() as keyof BetTree] = parseBetSizes(match[2]!);
  }
  if (!tree.flop.length) throw new Error("bet tree needs at least one flop size");
  return tree;
}

export function concreteBets(sizes: BetSize[], pot: number, stack: number): number[] {
  return concreteBetsWithCap(sizes, pot, stack, stack);
}

export function concretePotLimitBets(sizes: BetSize[], pot: number, call: number, stack: number): number[] {
  return concreteBetsWithCap(sizes, pot, stack, Math.min(potLimitMaxRaise(pot, call), stack));
}

function concreteBetsWithCap(sizes: BetSize[], pot: number, stack: number, cap: number): number[] {
  return [...new Set(sizes
    .map((size) => size.kind === "all-in" ? stack : pot * size.value / 100)
    .map((bet) => bet >= stack * 0.85 ? stack : Math.min(bet, stack))
    .map((bet) => Math.min(bet, cap))
    .filter((bet) => Number.isFinite(bet) && bet > 0)
    .sort((a, b) => a - b)
    .map((bet) => Math.round(bet * 1e9) / 1e9))];
}

function parseBetSizes(text: string): BetSize[] {
  const sizes = text.split(",").map((raw) => {
    const token = raw.trim();
    if (token.toLowerCase() === "all-in") return { kind: "all-in" } as const;
    const value = Number(token);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`bad bet size: ${token}`);
    return { kind: "percent", value } as const;
  });
  if (!sizes.length) throw new Error("bet tree street needs at least one size");
  return sizes;
}

export type SolverRow = { combo: string; weight: number; handClass: string; blockedCombos: number; blockerPct: number; fold: number; call: number; raise: number; foldEv: number; callEv: number; raiseEv: number; bestRaiseAmount: number; equity: number; ev: number; eqr: number };
export type SolveNode = { id: string; label: string; street: string; actions: string[]; infoSet?: string; amount?: number; pot?: number };
export type SolveInfoSet = { key: string; nodeId: string; street: string; actions: string[]; strategyRef: string; metricRef: string };
export type SolveResult = { nodes: SolveNode[]; informationSets: SolveInfoSet[]; rows: SolverRow[]; exploitability: { iteration: number; value: number }[]; metrics: { spr: number; mdf: number; alpha: number; potOdds: number; brGapPctPot?: number; ploFastExploitability?: number; ploSampleCount?: number; ploWeightCoverage?: number; ploIterations?: number; ploComboCap?: number; ploEquitySamples?: number } };
export const DEFAULT_RIVER_SPECS = [
  ["AA", 0.82],
  ["AKs", 0.72],
  ["QQ", 0.62],
  ["JTs", 0.52],
  ["76s", 0.42],
  ["A5s", 0.32]
] as const;

export function solveRiverSpot(pot: number, bet: number, stack = pot * 4.2, boardText = "", rakePct = 0, rakeCap = 0, game: Game = "NLH", betTree = "", precision: "fast" | "balanced" | "precise" = "balanced", heroRange = "", villainRange = ""): SolveResult {
  if (!Number.isFinite(pot) || pot <= 0) throw new Error("pot must be positive");
  if (!Number.isFinite(bet) || bet < 0) throw new Error("bet must be non-negative");
  if (!Number.isFinite(stack) || stack <= 0) throw new Error("stack must be positive");
  if (!Number.isFinite(rakePct) || rakePct < 0 || rakePct > 100) throw new Error("rake percent must be 0-100");
  if (!Number.isFinite(rakeCap) || rakeCap < 0) throw new Error("rake cap must be non-negative");
  if (betTree.trim()) parseBetTree(betTree);
  const board = parseBoardText(boardText);
  const potOdds = bet / (pot + 2 * bet);
  const mdf = pot / (pot + bet);
  const alpha = bet / (pot + bet);
  if (game === "PLO4" || game === "PLO5") return solvePloFastSpot(game, pot, bet, stack, rakePct, rakeCap, potOdds, mdf, alpha, board.length, betTree, precision);
  const betAmounts = betAmountsForSpot(game, board.length, pot, bet, stack, betTree);
  const iterations = precisionIterations(precision);
  const combos = nlhRiverCombosFromRange(heroRange, board);
  const villains = nlhRiverCombosFromRange(villainRange, board);
  const equityCache = new Map<string, number>();
  const rows = combos.map(({ combo, fallback, holes, weight }) => {
    const eq = comboEquity(holes, fallback, board, villains, equityCache);
    const { callEv, raiseEv, bestRaiseAmount } = rowActionEvs(eq, pot, bet, betAmounts, rakePct, rakeCap);
    const { fold, call, raise } = cfrStrategyFromActionEvs(0, callEv, raiseEv, iterations);
    const ev = (call * callEv + raise * raiseEv) / 100;
    const blockers = blockerStats(holes, board, villains);
    return { combo, weight, handClass: nlhHandClass(holes, board), ...blockers, fold, call, raise, foldEv: 0, callEv: callEv / 100, raiseEv: raiseEv / 100, bestRaiseAmount, equity: eq, ev, eqr: ev / Math.max(0.0001, eq * pot / 100) };
  });
  const nodes = rootNodes(board.length, pot, bet, stack, game, betTree);
  const brGapPctPot = nlhFallbackExploitability(rows, pot);
  return {
    nodes,
    informationSets: infoSetsFromNodes(nodes),
    rows,
    exploitability: fallbackProgress(rows, pot, brGapPctPot, 36).map((value, i) => ({ iteration: (i + 1) * 50, value })),
    metrics: { spr: stack / pot, mdf, alpha, potOdds, brGapPctPot }
  };
}

export function solveNlhComboSpot(pot: number, bet: number, stack = pot * 4.2, boardText = "", comboText = "AcAd", rakePct = 0, rakeCap = 0): SolveResult {
  if (!Number.isFinite(pot) || pot <= 0) throw new Error("pot must be positive");
  if (!Number.isFinite(bet) || bet < 0) throw new Error("bet must be non-negative");
  if (!Number.isFinite(stack) || stack <= 0) throw new Error("stack must be positive");
  const board = parseBoardText(boardText);
  const holes = parseComboCards(comboText);
  if (holes.length !== 2) throw new Error("NLH combo must have exactly two cards");
  if (holes.some((card) => board.includes(card)) || new Set(holes).size !== holes.length) throw new Error("duplicate combo card");
  const eq = comboEquity(holes, 0.5, board);
  const { callEv, raiseEv } = actionEvs(eq, pot, bet, rakePct, rakeCap);
  const strategy = cfrStrategy(eq, pot, bet, rakePct, rakeCap, 2_048);
  const row = {
    combo: holes.map(formatCard).join(""),
    weight: 1,
    handClass: nlhHandClass(holes, board),
    blockedCombos: 0,
    blockerPct: 0,
    ...strategy,
    foldEv: 0,
    callEv: callEv / 100,
    raiseEv: raiseEv / 100,
    bestRaiseAmount: bet,
    equity: eq,
    ev: (strategy.call * callEv + strategy.raise * raiseEv) / 100,
    eqr: 0
  };
  row.eqr = row.ev / Math.max(0.0001, eq * pot / 100);
  const rows = [row];
  const potOdds = bet / (pot + 2 * bet);
  const mdf = pot / (pot + bet);
  const alpha = bet / (pot + bet);
  const nodes = rootNodes(board.length, pot, bet, stack, "NLH");
  return {
    nodes,
    informationSets: infoSetsFromNodes(nodes),
    rows,
    exploitability: riverStrategyProgress(rows, pot, bet, 36, rakePct, rakeCap).map((value, i) => ({ iteration: (i + 1) * 50, value })),
    metrics: { spr: stack / pot, mdf, alpha, potOdds, brGapPctPot: riverExploitability(rows, pot, bet, rakePct, rakeCap) }
  };
}

export function plo4FastExploitabilityPctPot(iterations = 2_048): number {
  return ploFastExploitabilityPctPot(PLO4_FAST_SAMPLES, iterations);
}

export function plo5FastExploitabilityPctPot(iterations = 2_048): number {
  return ploFastExploitabilityPctPot(PLO5_FAST_SAMPLES, iterations);
}

function ploFastExploitabilityPctPot(samples: readonly PloFastSample[], iterations: number): number {
  const total = samples.reduce((sum, row) => sum + row.weight, 0);
  return samples.reduce((sum, row) => {
    const eq = ploFastSampleEquity(row);
    const strategy = cfrStrategy(eq, 100, 66, 0, 0, iterations);
    const mixed = [{ combo: row.combo, weight: row.weight, handClass: "sample", blockedCombos: 0, blockerPct: 0, equity: eq, ...strategy, foldEv: 0, callEv: 0, raiseEv: 0, bestRaiseAmount: 66, ev: 0, eqr: 0 }];
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

const PLO_COMBO_CAP = { PLO4: 20_000, PLO5: 30_000 } as const;
const PLO_FAST_EQUITY_SAMPLES = 512;

function ploFastHandClass(combo: string): string {
  const cards = combo.match(/../g) ?? [];
  const ranks = cards.map((card) => card[0]!);
  const suits = cards.map((card) => card[1]!);
  const paired = new Set(ranks).size < ranks.length;
  const aces = ranks.filter((rank) => rank === "A").length;
  const doubleSuited = new Set(suits.filter((suit) => suits.filter((candidate) => candidate === suit).length >= 2)).size >= 2;
  const values = [...new Set(ranks.map((rank) => "23456789TJQKA".indexOf(rank)).filter((value) => value >= 0))].sort((a, b) => a - b);
  const rundown = values.some((value, index) => values.slice(index, index + 4).every((next, offset) => next === value + offset));
  if (aces >= 2 && doubleSuited) return "AA double-suited";
  if (aces >= 2) return "AA";
  if (doubleSuited && rundown) return "double-suited rundown";
  if (rundown) return "rundown";
  if (paired) return "pair";
  return "unpaired";
}

function solvePloFastSpot(game: "PLO4" | "PLO5", pot: number, bet: number, stack: number, rakePct: number, rakeCap: number, potOdds: number, mdf: number, alpha: number, boardLen = 0, betTree = "", precision: "fast" | "balanced" | "precise" = "balanced"): SolveResult {
  const samples = game === "PLO4" ? PLO4_FAST_SAMPLES : PLO5_FAST_SAMPLES;
  const betAmounts = betAmountsForSpot(game, boardLen, pot, bet, stack, betTree);
  const iterations = precisionIterations(precision);
  const rows = samples.map((sample) => {
    const eq = ploFastSampleEquity(sample);
    const { callEv, raiseEv, bestRaiseAmount } = rowActionEvs(eq, pot, bet, betAmounts, rakePct, rakeCap);
    const strategy = cfrStrategyFromActionEvs(0, callEv, raiseEv, iterations);
    const ev = (strategy.call * callEv + strategy.raise * raiseEv) / 100;
    return {
      combo: sample.combo,
      weight: sample.weight,
      handClass: ploFastHandClass(sample.combo),
      blockedCombos: 0,
      blockerPct: 0,
      ...strategy,
      foldEv: 0,
      callEv: callEv / 100,
      raiseEv: raiseEv / 100,
      bestRaiseAmount,
      equity: eq,
      ev,
      eqr: ev / Math.max(0.0001, eq * pot / 100)
    };
  });
  const nodes = rootNodes(boardLen, pot, bet, stack, game, betTree);
  return {
    nodes,
    informationSets: infoSetsFromNodes(nodes),
    rows,
    exploitability: riverStrategyProgressFromRows(rows, pot, 36).map((value, i) => ({ iteration: (i + 1) * 50, value })),
    metrics: { spr: stack / pot, mdf, alpha, potOdds, brGapPctPot: riverExploitabilityFromRows(rows, pot), ploFastExploitability: game === "PLO4" ? plo4FastExploitabilityPctPot(iterations) : plo5FastExploitabilityPctPot(iterations), ploSampleCount: samples.length, ploWeightCoverage: samples.reduce((sum, sample) => sum + sample.weight, 0), ploIterations: iterations, ploComboCap: PLO_COMBO_CAP[game], ploEquitySamples: PLO_FAST_EQUITY_SAMPLES }
  };
}

function rootNodes(boardLen: number, pot: number, bet: number, stack: number, game: Game, betTree = ""): SolveNode[] {
  const street = boardLen === 0 ? "preflop" : boardLen === 3 ? "flop" : boardLen === 4 ? "turn" : "river";
  const actions = ["fold", "call", "raise"];
  const parsedBetTree = betTree.trim() ? parseBetTree(betTree) : null;
  const sizes = parsedBetTree ? boardLen === 4 ? parsedBetTree.turn : boardLen === 5 ? parsedBetTree.river : parsedBetTree.flop : [];
  const betNodes = sizes.length
    ? (game === "NLH" ? concreteBets(sizes, pot, stack) : concretePotLimitBets(sizes, pot, bet, stack))
      .map((amount) => ({ label: formatBetNode(amount, stack), amount, pot }))
    : [];
  return [
    withInfoSet({ id: "root", label: "Root", street, actions }),
    ...actions.map((action) => withInfoSet({ id: `root/${action}`, label: action.toUpperCase(), street, actions: [] })),
    ...(betNodes.length ? [withInfoSet({ id: "root/raise-sizes", label: "RAISE SIZES", street, actions: betNodes.map((bet) => bet.label) })] : []),
    ...betNodes.flatMap((bet) => {
      const id = `root/bet-${bet.label}`;
      return [
        withInfoSet({ id, label: `BET ${bet.label}`, street, actions: ["fold", "call"], amount: bet.amount, pot: bet.pot }),
        withInfoSet({ id: `${id}/fold`, label: "FOLD", street, actions: [], amount: bet.amount, pot: bet.pot }),
        withInfoSet({ id: `${id}/call`, label: "CALL", street, actions: [], amount: bet.amount, pot: bet.pot })
      ];
    })
  ];
}

function withInfoSet<T extends SolveNode>(node: T): T {
  return { ...node, infoSet: `${node.street}:${node.id}` };
}

function infoSetsFromNodes(nodes: SolveNode[]): SolveInfoSet[] {
  return nodes.map((node) => ({ key: node.infoSet ?? `${node.street}:${node.id}`, nodeId: node.id, street: node.street, actions: node.actions, ...infoSetRefs(node) }));
}

function infoSetRefs(node: SolveNode): Pick<SolveInfoSet, "strategyRef" | "metricRef"> {
  if (node.amount !== undefined && node.actions.length) return { strategyRef: "bet-response", metricRef: "bet-response" };
  if (node.amount !== undefined) return { strategyRef: "terminal", metricRef: `response:${node.id}` };
  if (node.id === "root") return { strategyRef: "root", metricRef: "root" };
  if (node.id === "root/raise-sizes") return { strategyRef: "raise-sizes", metricRef: "raise-sizes" };
  if (node.id.startsWith("root/")) return { strategyRef: "terminal", metricRef: `action:${node.id.slice("root/".length)}` };
  return { strategyRef: node.id, metricRef: node.id };
}

function betAmountsForSpot(game: Game, boardLen: number, pot: number, call: number, stack: number, betTree: string): number[] {
  if (!betTree.trim()) return [call];
  const tree = parseBetTree(betTree);
  const sizes = boardLen === 4 ? tree.turn : boardLen === 5 ? tree.river : tree.flop;
  const amounts = game === "NLH" ? concreteBets(sizes, pot, stack) : concretePotLimitBets(sizes, pot, call, stack);
  return amounts.length ? amounts : [call];
}

function precisionIterations(precision: "fast" | "balanced" | "precise"): number {
  return precision === "fast" ? 512 : precision === "precise" ? 4_096 : 2_048;
}

function formatBetNode(amount: number, stack: number): string {
  return Math.abs(amount - stack) <= 1e-9 ? "all-in" : Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function ploFastSampleEquity(row: PloFastSample): number {
  return ploVsRandomEquity(parseComboCards(row.combo), PLO_FAST_EQUITY_SAMPLES, row.seed);
}

function parseComboCards(combo: string): Card[] {
  if (!combo || combo.length % 2 !== 0) throw new Error(`bad combo: ${combo}`);
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

function cfrStrategy(equityValue: number, pot: number, bet: number, rakePct: number, rakeCap: number, iterations: number): { fold: number; call: number; raise: number } {
  const { callEv, raiseEv } = actionEvs(equityValue, pot, bet, rakePct, rakeCap);
  return cfrStrategyFromActionEvs(0, callEv, raiseEv, iterations);
}

function cfrStrategyFromActionEvs(foldEv: number, callEv: number, raiseEv: number, iterations: number): { fold: number; call: number; raise: number } {
  const utils = [0, callEv, raiseEv];
  utils[0] = foldEv;
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

function rowActionEvs(equityValue: number, pot: number, callBet: number, raiseBets: number[], rakePct: number, rakeCap: number): { callEv: number; raiseEv: number; bestRaiseAmount: number } {
  const { callEv } = actionEvs(equityValue, pot, callBet, rakePct, rakeCap);
  const [bestRaiseAmount, raiseEv] = raiseBets
    .map((amount) => [amount, actionEvs(equityValue, pot, amount, rakePct, rakeCap).raiseEv] as const)
    .reduce((best, next) => next[1] > best[1] ? next : best, [0, Number.NEGATIVE_INFINITY] as const);
  return { callEv, raiseEv, bestRaiseAmount };
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
  if (board.length === 1 || board.length === 2) throw new Error("solver board must be empty, flop, turn, or river");
  if (new Set(board).size !== board.length) throw new Error("duplicate board cards");
  return board;
}

type RiverCombo = { combo: string; fallback: number; holes: Card[]; weight: number };

function defaultRiverCombos(board: Card[]): RiverCombo[] {
  return DEFAULT_RIVER_SPECS.flatMap(([label, fallback]) => expandNlhCombo(label, board).map((holes) => ({ combo: holes.map(formatCard).join(""), fallback, holes, weight: 1 })));
}

function nlhRiverCombosFromRange(text: string, board: Card[]): RiverCombo[] {
  if (!text.trim()) return defaultRiverCombos(board);
  const combos = parseNlhRange(text).flatMap(({ label, weight }) => {
    const fallback = DEFAULT_RIVER_SPECS.find(([spec]) => spec === label)?.[1] ?? 0.5;
    return weight <= 0 ? [] : expandNlhCombo(label, board).map((holes) => ({ combo: holes.map(formatCard).join(""), fallback, holes, weight }));
  });
  if (!combos.length) throw new Error("range has no available combos");
  return combos;
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

function comboEquity(hero: Card[], fallback: number, board: Card[], villainCombos = defaultRiverCombos(board), cache?: Map<string, number>): number {
  if (!board.length) return fallback;
  const blocked = new Set([...board, ...hero]);
  const villains = villainCombos.filter((combo) => !combo.holes.some((card) => blocked.has(card)));
  if (!villains.length) return fallback;
  const heroKey = comboKey(hero);
  const weighted = villains.reduce((sum, villain) => {
    const villainKey = comboKey(villain.holes);
    const key = heroKey < villainKey ? `${heroKey}|${villainKey}` : `${villainKey}|${heroKey}`;
    const cached = cache?.get(key);
    if (cached !== undefined) return { equity: sum.equity + villain.weight * (heroKey < villainKey ? cached : 1 - cached), weight: sum.weight + villain.weight };
    const value = equity([{ cards: hero }, { cards: villain.holes }], board, "NLH", 0, 1)[0]!.equity;
    cache?.set(key, heroKey < villainKey ? value : 1 - value);
    return { equity: sum.equity + villain.weight * value, weight: sum.weight + villain.weight };
  }, { equity: 0, weight: 0 });
  return weighted.equity / weighted.weight;
}

function blockerStats(hero: Card[], board: Card[], villainCombos: RiverCombo[]): { blockedCombos: number; blockerPct: number } {
  const total = villainCombos.reduce((sum, combo) => sum + combo.weight, 0);
  const blocked = new Set([...board, ...hero]);
  const available = villainCombos.filter((combo) => !combo.holes.some((card) => blocked.has(card))).reduce((sum, combo) => sum + combo.weight, 0);
  const blockedCombos = total - available;
  return { blockedCombos, blockerPct: total ? blockedCombos / total : 0 };
}

function nlhHandClass(holes: Card[], board: Card[]): string {
  if (board.length < 3) return "preflop";
  const cards = [...holes, ...board];
  const category = Math.floor(Math.max(...combinations(cards, 5).map(evaluate5)) / CATEGORY_SHIFT);
  if (category >= 8) return "straight flush";
  if (category === 7) return "quads";
  if (category === 6) return "full house";
  if (category === 5) return "flush";
  if (category === 4) return "straight";
  if (category === 3) return rankOf(holes[0]!) === rankOf(holes[1]!) ? "set" : "trips";
  if (category === 2) return "two pair";
  if (category === 1) return holes.some((card) => rankOf(card) === Math.max(...board.map(rankOf))) ? "top pair" : "pair";
  if (board.length < 5 && hasFlushDraw(cards)) return "flush draw";
  if (board.length < 5 && hasStraightDraw(cards)) return "straight draw";
  return "air";
}

function hasFlushDraw(cards: Card[]): boolean {
  return [0, 1, 2, 3].some((suit) => cards.filter((card) => suitOf(card) === suit).length >= 4);
}

function hasStraightDraw(cards: Card[]): boolean {
  const ranks = new Set(cards.flatMap((card) => rankOf(card) === 12 ? [12, -1] : [rankOf(card)]));
  return Array.from({ length: 10 }, (_, start) => [-1, 0, 1, 2, 3].map((offset) => start + offset)).some((run) => run.filter((rank) => ranks.has(rank)).length >= 4);
}

function comboKey(cards: Card[]): string {
  return cards.map(formatCard).join("");
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

function riverStrategyProgressFromRows(rows: SolverRow[], pot: number, points: number): number[] {
  return Array.from({ length: points }, (_, i) => {
    const t = (i + 1) / points;
    const mixed = rows.map((row) => ({
      ...row,
      fold: (1 - t) / 3 + t * row.fold,
      call: (1 - t) / 3 + t * row.call,
      raise: (1 - t) / 3 + t * row.raise
    }));
    return riverExploitabilityFromRows(mixed, pot);
  });
}

function fallbackProgress(rows: SolverRow[], pot: number, target: number, points: number): number[] {
  const progress = riverStrategyProgressFromRows(rows, pot, points);
  progress[progress.length - 1] = target;
  return progress;
}

function nlhFallbackExploitability(rows: SolverRow[], pot: number): number {
  return riverExploitabilityFromRows(rows, pot);
}

function riverExploitability(rows: SolverRow[], pot: number, bet: number, rakePct: number, rakeCap: number): number {
  let strategyEv = 0;
  let bestEv = 0;
  for (const row of rows) {
    const foldEv = 0;
    const { callEv, raiseEv } = actionEvs(row.equity, pot, bet, rakePct, rakeCap);
    strategyEv += row.weight * (row.fold * foldEv + row.call * callEv + row.raise * raiseEv);
    bestEv += row.weight * Math.max(foldEv, callEv, raiseEv);
  }
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  return Math.max(0, (bestEv - strategyEv) / totalWeight / pot * 100);
}

function riverExploitabilityFromRows(rows: SolverRow[], pot: number): number {
  let strategyEv = 0;
  let bestEv = 0;
  for (const row of rows) {
    const foldEv = row.foldEv * 100;
    const callEv = row.callEv * 100;
    const raiseEv = row.raiseEv * 100;
    strategyEv += row.weight * (row.fold * foldEv + row.call * callEv + row.raise * raiseEv);
    bestEv += row.weight * Math.max(foldEv, callEv, raiseEv);
  }
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  return Math.max(0, (bestEv - strategyEv) / totalWeight / pot * 100);
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
