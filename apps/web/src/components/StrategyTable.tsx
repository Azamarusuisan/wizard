import type { SolverRow } from "@gto-lab/engine-wasm";

type RaiseSizeSpot = { pot: number; stack: number; rakePct: number; rakeCap: number };

export function StrategyTable({ rows, sizeActions, raiseSizeSpot }: { rows: SolverRow[]; sizeActions?: string[]; raiseSizeSpot?: RaiseSizeSpot }) {
  return (
    <table aria-label="strategy table">
      <thead><tr><th>Combo</th><th>Class</th><th>Wt</th><th>Blk</th>{sizeActions ? sizeActions.map((action) => <th key={action}>{action}</th>) : <><th>Fold</th><th>Call</th><th>Raise</th></>}<th>Best</th><th>F EV</th><th>C EV</th><th>R EV</th><th>EV</th><th>EQR</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.combo}>
            <td className="num">{r.combo}</td>
            <td>{r.handClass}</td>
            <td className="num">{(r.weight * 100).toFixed(0)}%</td>
            <td className="num">{r.blockedCombos.toFixed(1)}</td>
            {sizeActions ? sizeActions.map((action) => <td className="num" key={action}>{(raiseSizeFrequency(r, action, sizeActions, raiseSizeSpot) * 100).toFixed(0)}%</td>) : <>
              <td className="num">{(r.fold * 100).toFixed(0)}%</td>
              <td className="num">{(r.call * 100).toFixed(0)}%</td>
              <td className="num">{(r.raise * 100).toFixed(0)}%</td>
            </>}
            <td className="num">{r.bestRaiseAmount ? r.bestRaiseAmount.toFixed(0) : "-"}</td>
            <td className="num">{r.foldEv.toFixed(3)}</td>
            <td className="num">{r.callEv.toFixed(3)}</td>
            <td className="num">{r.raiseEv.toFixed(3)}</td>
            <td className="num">{r.ev.toFixed(3)}</td>
            <td className="num">{r.eqr.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function raiseSizeFrequency(row: SolverRow, action: string, actions: string[], spot?: RaiseSizeSpot): number {
  if (spot) {
    const mix = cfrAverageStrategy(actions.map((size) => raiseEv(row.equity, spot.pot, size === "all-in" ? spot.stack : Number(size), spot.rakePct, spot.rakeCap)), 256);
    return (mix[actions.indexOf(action)] ?? 0) * row.raise;
  }
  const exact = Number.isInteger(row.bestRaiseAmount) ? String(row.bestRaiseAmount) : row.bestRaiseAmount.toFixed(2);
  const target = actions.includes(exact) ? exact : actions.includes("all-in") ? "all-in" : exact;
  return action === target ? row.raise : 0;
}

function cfrAverageStrategy(utils: number[], iterations: number): number[] {
  const regrets = utils.map(() => 0);
  const strategySum = utils.map(() => 0);
  for (let iter = 0; iter < iterations; iter++) {
    const strategy = regretMatching(regrets);
    const nodeEv = strategy.reduce((sum, value, i) => sum + value * (utils[i] ?? 0), 0);
    for (let i = 0; i < utils.length; i++) {
      regrets[i] += (utils[i] ?? 0) - nodeEv;
      strategySum[i] += strategy[i] ?? 0;
    }
  }
  const total = strategySum.reduce((sum, value) => sum + value, 0);
  return total > 0 ? strategySum.map((value) => value / total) : strategySum;
}

function regretMatching(regrets: number[]): number[] {
  const positives = regrets.map((value) => Math.max(0, value));
  const total = positives.reduce((sum, value) => sum + value, 0);
  return total > 0 ? positives.map((value) => value / total) : positives.map(() => 1 / positives.length);
}

function raiseEv(equity: number, pot: number, bet: number, rakePct: number, rakeCap: number): number {
  const winPot = pot + bet - Math.min((pot + bet) * (rakePct / 100), rakeCap);
  const callEv = equity * winPot - (1 - equity) * bet;
  const foldResponse = bet / (pot + bet);
  const callResponse = pot / (pot + bet);
  return foldResponse * pot + callResponse * callEv;
}
