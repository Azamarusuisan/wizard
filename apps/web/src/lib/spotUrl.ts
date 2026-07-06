export type SolverSpot = {
  game: "NLH" | "PLO4" | "PLO5";
  position: "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB";
  villainPosition: "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB";
  potType: "SRP" | "3bet" | "4bet";
  precision: "fast" | "balanced" | "precise";
  pot: number;
  bet: number;
  stack: number;
  board: string;
  rakePct: number;
  rakeCap: number;
  betTree?: string;
  heroRange?: string;
  villainRange?: string;
};

export function encodeSpot(spot: SolverSpot): string {
  const json = JSON.stringify(spot);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeSpot(value: string | null): SolverSpot | null {
  if (!value) return null;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SolverSpot>;
    if (!validNumber(raw.pot) || !validNumber(raw.bet) || !validNumber(raw.stack) || typeof raw.board !== "string") return null;
    const rakePct = raw.rakePct ?? 0;
    const rakeCap = raw.rakeCap ?? 0;
    const game = raw.game ?? "NLH";
    const position = raw.position ?? "BTN";
    const villainPosition = raw.villainPosition ?? "BB";
    const potType = raw.potType ?? "SRP";
    const precision = raw.precision ?? "balanced";
    if (!validNumber(rakePct) || !validNumber(rakeCap) || !validGame(game)) return null;
    if (!validPosition(position) || !validPosition(villainPosition) || !validPotType(potType) || !validPrecision(precision)) return null;
    return {
      game,
      position,
      villainPosition,
      potType,
      precision,
      pot: raw.pot,
      bet: raw.bet,
      stack: raw.stack,
      board: raw.board,
      rakePct,
      rakeCap,
      betTree: typeof raw.betTree === "string" ? raw.betTree : undefined,
      heroRange: typeof raw.heroRange === "string" ? raw.heroRange : undefined,
      villainRange: typeof raw.villainRange === "string" ? raw.villainRange : undefined
    };
  } catch {
    return null;
  }
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validGame(value: unknown): value is "NLH" | "PLO4" | "PLO5" {
  return value === "NLH" || value === "PLO4" || value === "PLO5";
}

function validPosition(value: unknown): value is SolverSpot["position"] {
  return value === "UTG" || value === "HJ" || value === "CO" || value === "BTN" || value === "SB" || value === "BB";
}

function validPotType(value: unknown): value is SolverSpot["potType"] {
  return value === "SRP" || value === "3bet" || value === "4bet";
}

function validPrecision(value: unknown): value is SolverSpot["precision"] {
  return value === "fast" || value === "balanced" || value === "precise";
}
