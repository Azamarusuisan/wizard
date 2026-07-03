# Handoff

## Current State

- Environment setup was executed successfully; logs are in `docs/ENV_SETUP.log`.
- Plan A is active: Rust, wasm target, wasm-pack, nightly rust-src, and Playwright Chromium are available.
- `scripts/verify.sh` exists and currently exits 0 for the tests presently in the repo.
- Rust crate now has modules for `eval`, `iso`, `equity`, `tree`, `cfr`, `br`, and `bucket`.
- Suit-isomorphism class counts are now exhaustive Rust tests for NLH preflop, PLO4, PLO5, and flop: `169 / 16,432 / 134,459 / 1,755`.
- NLH exact equity gates now cover AA vs KK, AKs vs QQ, and mirror-suit invariance.
- Kuhn poker gate now runs an actual CFR trainer and converges to `-1/18 ± 1e-3`.
- NLH river small-spot gate now computes exploitability from action EVs and strategy rows instead of returning a fixed scalar.
- NLH flop Balanced gate now computes exploitability through a one-step abstraction tree over exact-equity representative flop buckets rather than returning a fixed scalar. It is still not the final full flop CFR/BR implementation.
- Leduc has a tabular CFR + average-strategy BR probe in Rust. Chance reach is included in regret and average-strategy weighting. Fold payoff is locked by a test (`p1 folds => +1`, `p0 folds => -1`). The gate now uses measured imperfect-information best response rather than a fixed scalar.
- PLO4 Fast exploitability no longer returns a fixed scalar; it computes a weighted representative bucket BR gap. It is still a small sampled proxy, not full PLO MCCFR.
- Native WASM solve payload now reuses the shared river best-response row builder instead of duplicating strategy formulas in the handle serializer path.
- IndexedDB stores `solves`, `ranges`, and `training` exist in the web app. Unit tests cover range save/load, quantized solve save/load, stats, clear, and oldest-first solve pruning. Playwright covers range persistence, same-spot solve cache hit, and Settings data clearing.
- CI workflow exists for Node and Rust.
- Production code grep for `TODO|FIXME|未実装|placeholder` is clean.
- `packages/engine-wasm` now exposes an `EngineAPI` facade (`init`, `solve`, `pollProgress`, `getStrategy`, `getHandMetrics`, `cancel`, `serialize`, `result`). It prefers the generated wasm-pack backend when `pkg/gto_lab_engine.js` exists and falls back to `LocalEngine` only when the package is unavailable. The unit test proves the wasm backend is selected after `wasm-pack build`.
- `crates/engine` now exports wasm-bindgen handle/progress functions matching the EngineAPI shape: `init`, `solve`, `poll_progress`, `get_strategy`, `get_hand_metrics`, `cancel`, and `serialize`. Native serialized solve payloads include combo labels, so TypeScript no longer owns solver row identity for the WASM path.

## Important Caveat

The full Definition of Done is not satisfied. Several gates still use small sampled abstractions and must be replaced with full implementations before completion can be claimed.

## Next Commands

```bash
cd /Users/zettai/gto-lab
. "$HOME/.cargo/env"
bash scripts/verify.sh
```

## Next Implementation Work

1. Expand `br::nlh_flop_balanced_exploitability_pct_pot` from the current one-step abstraction tree to a full flop CFR/BR tree.
2. Replace the remaining simplified Rust solve payload with real tree/CFR output.
3. Add `docs/COMPLETION_REPORT.md` only when the spec-vs-implementation table can honestly be all green.
