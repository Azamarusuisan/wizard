# Handoff

## Current State

- Environment setup was executed successfully; logs are in `docs/ENV_SETUP.log`.
- Plan A is active: Rust, wasm target, wasm-pack, nightly rust-src, and Playwright Chromium are available.
- `scripts/verify.sh` exists and currently exits 0 for the tests presently in the repo.
- Rust crate now has modules for `eval`, `iso`, `equity`, `tree`, `cfr`, `br`, and `bucket`.
- Suit-isomorphism class counts are now exhaustive Rust tests for NLH preflop, PLO4, PLO5, and flop: `169 / 16,432 / 134,459 / 1,755`.
- NLH equity gates now cover AA vs KK, AKs vs QQ, mirror-suit invariance, and seeded MC-vs-exact confidence agreement.
- PLO tests now cover PLO4/PLO5 exact two-hole usage, board-only hands being unplayable, and seeded PLO4 AAxx double-suited-over-rainbow monotonicity.
- Kuhn poker gate now runs an actual CFR trainer and converges to `-1/18 ± 1e-3`.
- TS fallback `kuhnCfr()` now runs tabular Kuhn CFR instead of returning a closed-form approximation.
- NLH river small-spot gate now computes exploitability from action EVs and strategy rows instead of returning a fixed scalar.
- NLH flop Balanced gate now computes exploitability through a one-step abstraction tree over exact-equity representative flop buckets rather than returning a fixed scalar. It is still not the final full flop CFR/BR implementation.
- Leduc has a tabular CFR + average-strategy BR probe in Rust. Chance reach is included in regret and average-strategy weighting. Fold payoff is locked by a test (`p1 folds => +1`, `p0 folds => -1`). The gate now uses measured imperfect-information best response rather than a fixed scalar.
- PLO4 Fast exploitability no longer returns a fixed scalar; it computes a weighted representative bucket BR gap. It is still a small sampled proxy, not full PLO MCCFR.
- Bucket module now has fixed-seed 10-feature k-means++ and a variance-quality gate proving more clusters do not worsen synthetic equity-feature clustering.
- Rust solver gates now include a compact flop abstraction trend check: 2 buckets >= 4 buckets >= 6 buckets exploitability.
- Native WASM solve payload now reuses the shared river best-response row builder instead of duplicating strategy formulas in the handle serializer path.
- Native and TS fallback river solve rows now use named default row specs instead of independent ad-hoc combo/equity arrays.
- Native and TS fallback solve progress now measures BR exploitability on interpolated strategy rows instead of emitting a synthetic linear curve.
- Native and TS fallback combo EV/EQR now use strategy-weighted action EV rather than always using call EV.
- Solve rows now carry fold/call/raise action EVs through native WASM, TS fallback, and IndexedDB cache.
- Strategy table now displays fold/call/raise action EV columns alongside aggregate EV/EQR.
- Trainer now scores the selected action from solve-row action EVs and displays EV loss, grade, and GTO raise frequency. Keyboard shortcuts are wired: `F`/`X` fold, `C` call, `B`/`R` bet/raise, with Playwright coverage.
- Solver worker/client/UI now expose a cancel path wired to `EngineAPI.cancel`.
- Solver Studio guards against duplicate solve clicks while a run is active; Playwright waits for the cancel button lifecycle before asserting same-spot cache hits.
- Solver spot payload now carries optional effective stack, and native/TS fallback/UI compute SPR as `stack / pot` instead of using a fixed display value.
- Solver spot payload/cache key now carries optional board text from the Solver Studio input. Native and TS fallback river rows parse/validate board cards, expand the default NLH labels to concrete combos, and recompute board-aware combo equities from exact NLH enumeration when board text is present. This is still default-combo river solving, not full range/tree board-aware CFR.
- Solver spot payload/cache key now carries rake percent and cap. Native WASM and TS fallback river action EVs subtract capped rake from the win pot; tests cover that rake lowers call/raise showdown EV.
- Solver Studio displays an `abstracted` badge and explicitly says exploitability is measured on the default-combo abstraction. Playwright covers the disclosure.
- Solver Studio catches invalid spot inputs before rendering strategy/metrics, displays the validation error, and disables solve. Playwright covers duplicate board-card input.
- Solver Studio now reads/writes shareable spot configs through `?spot=<base64url-json>`. Unit tests cover the codec and Playwright verifies solve updates the URL.
- Native and TS solve entry points now reject non-positive pot/stack and negative bet before metric calculation.
- IndexedDB stores `solves`, `ranges`, and `training` exist in the web app. Solve records now carry `meta.version = 1`. Unit tests cover range save/load, quantized solve save/load, record version, stats, clear, and oldest-first solve pruning. Playwright covers range persistence, same-spot solve cache hit, and Settings data clearing.
- Equity Lab now has a game selector for NLH/PLO4/PLO5; Playwright covers a PLO5 exact-board equity path.
- Equity Lab displays engine validation errors such as PLO5 hole-count mismatches instead of silently showing an empty result.
- Equity Lab now supports adding/removing player slots from 2 to 6; Playwright covers a 3-way exact-board equity path.
- Equity calculation now accepts dead cards in the TypeScript API and Equity Lab UI; unit and Playwright tests cover blocker exclusion and duplicate-card validation.
- Equity Lab now exposes Auto/Exact/MC mode and iteration controls; Playwright covers manual MC.
- Equity Lab displays equity, win, tie, and CI for each player; Playwright asserts win/tie labels are present.
- Language, theme, deck-color, and precision settings are persisted to localStorage through the Zustand store. Settings theme/deck selects update `html[data-theme]` and `html[data-deck]`; precision select preserves `fast`/`balanced`/`precise`; unit and Playwright tests cover this.
- NLH range parser now expands standard plus/span syntax such as `AJo+`, `TT-77:0.25`, and `76s-54s`; package tests cover the spec examples.
- PLO range parser now validates rank patterns, `ds`/`ss`/`r` suitedness, and `@0..100` percentages; package tests cover the spec examples.
- TypeScript equity now validates game-specific hole counts for NLH/PLO4/PLO5 and tests exact-board PLO5 equity.
- CI workflow exists for Node and Rust.
- Production code grep for `TODO|FIXME|未実装|placeholder` is clean.
- `packages/engine-wasm` now exposes an `EngineAPI` facade (`init`, `solve`, `pollProgress`, `getStrategy`, `getHandMetrics`, `cancel`, `serialize`, `result`). It prefers the generated wasm-pack backend when `pkg/gto_lab_engine.js` exists and falls back to `LocalEngine` only when the package is unavailable. The unit test proves the wasm backend is selected after `wasm-pack build`.
- The TypeScript fallback evaluator test also covers PLO5 exact two-hole usage and board-only hands being unplayable.
- `crates/engine` now exports wasm-bindgen handle/progress functions matching the EngineAPI shape: `init`, `solve`, `poll_progress`, `get_strategy`, `get_hand_metrics`, `cancel`, and `serialize`. Native serialized solve payloads include combo labels, so TypeScript no longer owns solver row identity for the WASM path.
- README, architecture, and formats docs now reflect the current Plan A Rust/WASM path, IndexedDB solve cache shape, and remaining representative-solver limitation.
- PLAN now reflects current Plan A evidence, per-milestone verification commands, and remaining M4/M5/M7 work instead of the earlier cargo-unavailable slice.
- Criterion benches now exist for `nlh7_eval` and `representative_river_solve`. Latest local `cargo bench -p gto_lab_engine --bench engine_bench`: `nlh7_eval` ~1.07 us/eval, representative river rows ~12.8 ns. The evaluator still needs a faster table/perfect-hash path to reach the original 50M eval/s target.
- Last verified: `bash scripts/verify.sh` exited 0 after expanding Solver Studio solve output to concrete default NLH combos.

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
3. Replace the current slow combinational NLH evaluator with a table/perfect-hash evaluator or equivalent before claiming the 50M eval/s target.
4. Add `docs/COMPLETION_REPORT.md` only when the spec-vs-implementation table can honestly be all green.
