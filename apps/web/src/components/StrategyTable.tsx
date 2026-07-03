import type { SolverRow } from "@gto-lab/engine-wasm";

export function StrategyTable({ rows }: { rows: SolverRow[] }) {
  return (
    <table aria-label="strategy table">
      <thead><tr><th>Combo</th><th>Fold</th><th>Call</th><th>Raise</th><th>EV</th><th>EQR</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.combo}>
            <td className="num">{r.combo}</td>
            <td className="num">{(r.fold * 100).toFixed(0)}%</td>
            <td className="num">{(r.call * 100).toFixed(0)}%</td>
            <td className="num">{(r.raise * 100).toFixed(0)}%</td>
            <td className="num">{r.ev.toFixed(3)}</td>
            <td className="num">{r.eqr.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
