import { formatCard, suitOf, type Card } from "@gto-lab/engine-wasm";

const suitClass = ["clubs", "diamonds", "hearts", ""] as const;

export function CardView({ card }: { card: Card }) {
  return <div className={`playing-card ${suitClass[suitOf(card)]}`}>{formatCard(card).toUpperCase()}</div>;
}
