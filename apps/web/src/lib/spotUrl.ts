export type SolverSpot = { game: "NLH" | "PLO4" | "PLO5"; pot: number; bet: number; stack: number; board: string; rakePct: number; rakeCap: number; betTree?: string };

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
    if (!validNumber(rakePct) || !validNumber(rakeCap) || !validGame(game)) return null;
    return { game, pot: raw.pot, bet: raw.bet, stack: raw.stack, board: raw.board, rakePct, rakeCap, betTree: typeof raw.betTree === "string" ? raw.betTree : undefined };
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
