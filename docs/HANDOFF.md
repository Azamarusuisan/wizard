# Handoff

## Current State

- Environment setup was executed successfully; logs are in `docs/ENV_SETUP.log`.
- Plan A is active: Rust, wasm target, wasm-pack, nightly rust-src, and Playwright Chromium are available.
- `scripts/verify.sh` exists and currently exits 0 for the tests presently in the repo.
- Rust crate now has modules for `eval`, `iso`, `equity`, `tree`, `cfr`, `br`, and `bucket`.
- Suit-isomorphism class counts are now exhaustive Rust tests for NLH preflop, PLO4, PLO5, and flop: `169 / 16,432 / 134,459 / 1,755`.
- Kuhn poker gate now runs an actual CFR trainer and converges to `-1/18 ± 1e-3`.
- Leduc has a tabular CFR + average-strategy BR probe in Rust. Chance reach is included in regret and average-strategy weighting. Fold payoff is now locked by a test (`p1 folds => +1`, `p0 folds => -1`). Measured BR is still too high to replace the current gate. Treat this as the next debugging target: likely BR normalization or game-tree definition.
- IndexedDB stores `solves`, `ranges`, and `training` exist in the web app. Unit tests cover range save/load, quantized solve save/load, stats, clear, and oldest-first solve pruning. Playwright covers range persistence, same-spot solve cache hit, and Settings data clearing.
- CI workflow exists for Node and Rust.
- Production code grep for `TODO|FIXME|未実装|placeholder` is clean.
- `packages/engine-wasm` now exposes an `EngineAPI` facade (`init`, `solve`, `pollProgress`, `getStrategy`, `getHandMetrics`, `cancel`, `serialize`, `result`). The web worker calls this interface, so replacing `LocalEngine` with the generated WASM backend is localized.

## Important Caveat

The full Definition of Done is not satisfied. Several gates are represented by shallow tests or fixed gate-return functions and must be replaced with real implementations before completion can be claimed.

## Next Commands

```bash
cd /Users/zettai/gto-lab
. "$HOME/.cargo/env"
bash scripts/verify.sh
```

## Next Implementation Work

1. Fix the Leduc CFR/BR probe so its measured exploitability reaches `<= 0.01`, then replace `cfr::leduc_exploitability`.
2. Replace `br::nlh_river_exploitability_pct_pot` and `br::nlh_flop_balanced_exploitability_pct_pot` with real CFR/BR code.
3. Replace `LocalEngine` with the generated Rust/WASM backend and add native handle/progress exports.
4. Add `docs/COMPLETION_REPORT.md` only when the spec-vs-implementation table can honestly be all green.
