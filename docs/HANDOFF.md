# Handoff

## Current State

- Environment setup was executed successfully; logs are in `docs/ENV_SETUP.log`.
- Plan A is active: Rust, wasm target, wasm-pack, nightly rust-src, and Playwright Chromium are available.
- `scripts/verify.sh` exists and currently exits 0 for the tests presently in the repo.
- Rust crate now has modules for `eval`, `iso`, `equity`, `tree`, `cfr`, `br`, and `bucket`.
- Suit-isomorphism class counts are now exhaustive Rust tests for NLH preflop, PLO4, PLO5, and flop: `169 / 16,432 / 134,459 / 1,755`.
- NLH equity gates now cover AA vs KK, AKs vs QQ, mirror-suit invariance, and seeded MC-vs-exact confidence agreement.
- NLH 7-card evaluation now uses direct rank/suit counts instead of enumerating all 21 five-card subsets. A test checks representative hands against the brute-force best-five path.
- PLO tests now cover PLO4/PLO5 exact two-hole usage, board-only hands being unplayable, and seeded PLO4 AAxx double-suited-over-rainbow monotonicity.
- Kuhn poker gate now runs an actual CFR trainer and converges to `-1/18 ± 1e-3`.
- TS fallback `kuhnCfr()` now runs tabular Kuhn CFR instead of returning a closed-form approximation.
- NLH river small-spot gate now computes exploitability from action EVs and strategy rows instead of returning a fixed scalar.
- NLH flop Balanced gate now computes exploitability through a compact flop-to-river continuation abstraction over exact-equity representative flop buckets rather than returning a fixed scalar. It is still not the final full flop CFR/BR implementation.
- Leduc has a tabular CFR + average-strategy BR probe in Rust. Chance reach is included in regret and average-strategy weighting. Fold payoff is locked by a test (`p1 folds => +1`, `p0 folds => -1`). The gate now uses measured imperfect-information best response rather than a fixed scalar.
- PLO4/PLO5 Fast exploitability no longer returns a fixed scalar; it computes a weighted representative bucket BR gap. It is still a small sampled proxy, not full PLO MCCFR.
- Bucket module now has fixed-seed 10-feature k-means++ and a variance-quality gate proving more clusters do not worsen synthetic equity-feature clustering.
- Rust solver gates now include a compact flop abstraction trend check: 2 buckets >= 4 buckets >= 6 buckets exploitability.
- Native WASM solve payload now reuses the shared river best-response row builder instead of duplicating strategy formulas in the handle serializer path.
- Native and TS fallback river solve rows now use named default row specs instead of independent ad-hoc combo/equity arrays.
- Rust river gate/bench row generation now goes through the same default concrete combo expansion used by native solve instead of six standalone representative equities.
- NLH river row generation now uses a small regret-matching CFR average strategy per combo over fold/call/raise EVs in both Rust native solve and TypeScript fallback, replacing immediate pure best-response rows. This is still not a full two-player public tree CFR.
- Native and TS fallback solve progress now measures BR exploitability on interpolated strategy rows instead of emitting a synthetic linear curve.
- Native and TS fallback combo EV/EQR now use strategy-weighted action EV rather than always using call EV.
- Native and TS fallback tests now explicitly assert `SPR = stack / pot`, `MDF = P / (P+B)`, bluff breakeven alpha `= B / (P+B)`, and pot odds `= B / (P+2B)`.
- Solve rows now carry fold/call/raise action EVs through native WASM, TS fallback, and IndexedDB cache.
- Strategy table now displays fold/call/raise action EV columns alongside aggregate EV/EQR.
- Trainer now scores the selected action from solve-row action EVs, persists attempts to IndexedDB training history, and displays EV loss, grade, GTO raise frequency, attempts, average loss, and last action. Keyboard shortcuts are wired: `F`/`X` fold, `C` call, `B`/`R` bet/raise, with Playwright coverage.
- Trainer history now stores `nodeId` and `street` with each attempt so later multi-node drills can reuse the same records.
- Trainer summary now displays the stored node id and street for the latest attempt.
- Trainer fixed spot now solves the displayed `Ah Kd 7c` board, so persisted drill metadata reports `flop` instead of an inconsistent preflop root. The fixed solve is memoized to avoid repeating board-aware equity enumeration on every answer render.
- Trainer displayed hero hand now matches the scored solve row (`AcAd`) instead of showing an unrelated `AsQs` combo.
- TypeScript engine now exposes `solveNlhComboSpot()` for single-combo board-aware drills. Trainer uses it instead of building every default solve row; Playwright Trainer flow dropped from about 10s to about 0.6s in the full verify run.
- TypeScript board-aware `solveRiverSpot()` now caches unordered hero/villain matchup equities within one solve, avoiding duplicate exact enumeration for reversed pairings. The board-aware fallback test is now about 6s instead of about 11s on this machine.
- TypeScript combo-card parsing now rejects empty or odd-length combo strings before card slicing, and `solveNlhComboSpot()` tests cover malformed combo input.
- Rust native board-aware solve now also caches unordered hero/villain matchup equities within one solve. A Rust test compares cached and uncached combo equity for the same board.
- Solver worker/client/UI now expose a cancel path wired to `EngineAPI.cancel`.
- Solver Studio guards against duplicate solve clicks while a run is active; Playwright waits for the cancel button lifecycle before asserting same-spot cache hits.
- Solver spot payload now carries optional effective stack, and native/TS fallback/UI compute SPR as `stack / pot` instead of using a fixed display value.
- Solver spot payload/cache key now carries optional board text from the Solver Studio input. Native and TS fallback river rows parse/validate board cards, expand the default NLH labels to concrete combos, and recompute board-aware combo equities from exact NLH enumeration when board text is present. This is still default-combo river solving, not full range/tree board-aware CFR.
- Solver spot payload/cache key now carries rake percent and cap. Native WASM and TS fallback river action EVs subtract capped rake from the win pot; tests cover that rake lowers call/raise showdown EV.
- Solver spot payload/cache key now carries game. PLO4/PLO5 in Solver Studio return Fast sampled BR metrics instead of silently using NLH rows; the real MCCFR path still needs to replace this proxy.
- PLO4/PLO5 Fast solve rows now use concrete representative combo labels and derive their equity from seeded PLO-vs-random MC before computing pure fold/call/raise strategy from current pot/bet/rake EV. This is still a representative proxy, not full PLO MCCFR.
- PLO4/PLO5 Fast representative rows now also use the shared regret-matching average strategy instead of immediate best response. This remains a representative proxy, not external-sampling MCCFR.
- Solve metrics now include `brGapPctPot`, computed from the same rows used for the strategy table and convergence graph. UI shows it as `BR gap`.
- Solver Studio now includes an editable bet-tree preset string and flop-size buttons that apply `% pot` or all-in values to the active bet amount. The bet-tree string is validated, included in share URLs and solve cache payloads, but the production solve still consumes one bet size.
- Solver payloads now preserve `betTree` through the worker type and Rust native serialized spot so cached/native results retain the original betting-tree text.
- Solve node serialization now also surfaces configured flop bet-tree concrete sizes as terminal child nodes such as `root/bet-33` and `root/bet-all-in` while the current three-column abstract strategy remains unchanged.
- Bet-size node serialization now selects the configured sizes for the current board street (`flop` / `turn` / `river`) instead of always using flop sizes. Rust native and TypeScript fallback tests cover turn/river selection.
- PLO4/PLO5 bet-size nodes use the pot-limit capped concrete sizes; Rust native and TypeScript fallback tests cover a PLO4 cap example (`root/bet-160` instead of an uncapped all-in).
- Bet-size nodes now carry `amount` and `pot`, expose `fold` / `call` actions, and EngineAPI returns an MDF/alpha response strategy for those nodes instead of an empty payload. Hand metrics remain empty for bet-response nodes until full branch EVs are serialized.
- Rust native spot validation now parses `flop` / `turn` / `river` bet-tree text with numeric `% pot` sizes and `all-in`, rejecting malformed trees before solve creation.
- Rust bet-tree utilities now expand `% pot` / `all-in` sizes into concrete bet amounts, applying the spec's 85% stack all-in rounding and de-duplicating equivalent all-ins.
- Rust bet-tree utilities now also expose pot-limit capped concrete sizes using the existing `pot + 3 * call` formula; tests cover a capped all-in/oversized PLO size.
- TypeScript fallback and Solver Studio now use the shared engine-wasm bet-tree parser, so WASM and local backends reject the same malformed tree strings.
- TypeScript fallback now also exposes concrete bet-size expansion, and Solver Studio's bet-size buttons use it instead of duplicating `% pot` math in the UI.
- TypeScript fallback also exposes pot-limit capped concrete sizes, and Solver Studio uses the cap for PLO4/PLO5 bet-size buttons.
- Solver Studio board input now has Random flop, Monotone, and Paired buttons; Playwright covers category/random board updates.
- Solver Studio no longer runs board-aware NLH range equity synchronously during preview; board-card validation stays on the main thread and the actual solve runs through the worker path.
- Solver Studio displays an `abstracted` badge and explicitly says exploitability is measured on the default-combo abstraction. Playwright covers the disclosure.
- Solver Studio catches invalid spot inputs before rendering strategy/metrics, displays the validation error, and disables solve. Playwright covers duplicate board-card input.
- The left navigation can collapse to icon-only mode; Playwright covers the shell toggle.
- Solver Studio now reads/writes shareable spot configs through `?spot=<base64url-json>`. Unit tests cover the codec and Playwright verifies solve updates the URL.
- Native and TS solve entry points now reject non-positive pot/stack and negative bet before metric calculation.
- IndexedDB stores `solves`, `ranges`, and `training` exist in the web app. Solve records now carry `meta.version = 1`. Unit tests cover range save/load, quantized solve save/load, training history save/list, record version, stats, clear, individual solve delete, and oldest-first solve pruning. Playwright covers range persistence, same-spot solve cache hit, Trainer history persistence, Settings individual solve delete, and Settings data clearing.
- Equity Lab now has a game selector for NLH/PLO4/PLO5; Playwright covers a PLO5 exact-board equity path.
- Equity Lab displays engine validation errors such as PLO5 hole-count mismatches instead of silently showing an empty result.
- Equity Lab now supports adding/removing player slots from 2 to 6; Playwright covers a 3-way exact-board equity path.
- Equity calculation now accepts dead cards in the TypeScript API and Equity Lab UI; unit and Playwright tests cover blocker exclusion and duplicate-card validation.
- TypeScript engine API now exposes `estimateEquityEvaluations()` and `equityAuto()` with the spec threshold of 20,000,000 evaluations; package tests cover exact vs MC switching without forcing the UI into slow preflop exact enumeration.
- Rust equity now exposes `EXACT_EQUITY_EVAL_THRESHOLD`, heads-up NLH evaluation estimates, and an auto exact/MC switch with release tests.
- Equity Lab now exposes Auto/Exact/MC mode and iteration controls; Playwright covers manual MC.
- Equity Lab now displays the auto-mode exact/MC decision and estimated evaluation count from the shared TypeScript estimator while preserving the current non-blocking preflop MC default.
- Equity Lab displays equity, win, tie, CI, and Player 1 hand-category distribution; Playwright asserts win/tie and distribution labels are present.
- Language, theme, deck-color, and precision settings are persisted to localStorage through the Zustand store. The top bar toggles language and theme, Settings theme/deck selects update `html[data-theme]` and `html[data-deck]`, and precision select preserves `fast`/`balanced`/`precise`; unit and Playwright tests cover this.
- NLH range parser now expands standard plus/span syntax such as `AJo+`, `TT-77:0.25`, and `76s-54s`; package tests cover the spec examples.
- PLO range parser now validates rank patterns, `ds`/`ss`/`r` suitedness, and `@0..100` percentages; package tests cover the spec examples.
- Range Editor now imports/exports range JSON as `{version:1,kind:"range",payload:{text}}`; Playwright covers JSON import and persisted reload.
- TypeScript equity now validates game-specific hole counts for NLH/PLO4/PLO5 and tests exact-board PLO5 equity.
- CI workflow exists for Node and Rust.
- Production code grep for `TODO|FIXME|未実装|placeholder` is clean.
- `packages/engine-wasm` now exposes an `EngineAPI` facade (`init`, `solve`, `pollProgress`, `getStrategy`, `getHandMetrics`, `cancel`, `serialize`, `result`). It prefers the generated wasm-pack backend when `pkg/gto_lab_engine.js` exists and falls back to `LocalEngine` only when the package is unavailable. The unit test proves the wasm backend is selected after `wasm-pack build`.
- Engine strategy/metric calls now validate node ids across `root` and first-level action nodes, avoiding silent fallback for unknown node ids.
- Solve results now carry a `nodes` array through Rust native serialization, TypeScript fallback, EngineAPI conversion, IndexedDB cache, and Solver Studio display.
- Root solve node metadata now includes action labels (`fold`, `call`, `raise`) across Rust/TS/cache/UI.
- Root solve node street now derives from board length (`preflop` / `flop` / `turn` / `river`) in Rust native and TypeScript fallback results.
- Solve node serialization now includes first-level action nodes (`root/fold`, `root/call`, `root/raise`) in Rust native and TypeScript fallback results. EngineAPI node-id validation accepts these nodes, and IndexedDB round-trip tests prove they persist.
- Terminal first-level action nodes now return empty strategy and hand-metric payloads instead of incorrectly echoing the root strategy. Rust native and EngineAPI tests cover `root/call`.
- Solver Studio now renders solve nodes as a readable list and Playwright verifies `root/call` is surfaced after a solve.
- The TypeScript fallback evaluator test also covers PLO5 exact two-hole usage and board-only hands being unplayable.
- `crates/engine` now exports wasm-bindgen handle/progress functions matching the EngineAPI shape: `init`, `solve`, `poll_progress`, `get_strategy`, `get_hand_metrics`, `cancel`, and `serialize`. Native serialized solve payloads include combo labels, so TypeScript no longer owns solver row identity for the WASM path.
- README, architecture, and formats docs now reflect the current Plan A Rust/WASM path, IndexedDB solve cache shape, and remaining default-combo / sampled-PLO limitations.
- IndexedDB solve cache keys are canonical JSON SHA-256 via WebCrypto in the web layer.
- PLAN now reflects current Plan A evidence, per-milestone verification commands, and remaining M4/M5/M7 work instead of the earlier cargo-unavailable slice.
- Criterion benches now exist for `nlh7_eval` and `default_river_solve`. Latest local `cargo bench -p gto_lab_engine --bench engine_bench`: `nlh7_eval` ~11.66 ns/eval, default river rows ~501.65 us. The evaluator now exceeds the original 50M eval/s target on this machine.
- Last verified: `bash scripts/verify.sh` exited 0 after adding MDF/alpha response strategies for bet-size nodes. Latest bench: `cargo bench -p gto_lab_engine --bench engine_bench` exited 0 with `nlh7_eval` ~11.66 ns/eval.
- Git remote `origin` is set to `https://github.com/Azamarusuisan/wizard.git`; do not push until §6 is actually complete.

## Important Caveat

The full Definition of Done is not satisfied. Several gates still use small sampled abstractions and must be replaced with full implementations before completion can be claimed.

## Next Commands

```bash
cd /Users/zettai/gto-lab
. "$HOME/.cargo/env"
bash scripts/verify.sh
```

## Next Implementation Work

1. Expand `br::nlh_flop_balanced_exploitability_pct_pot` from the current compact continuation abstraction to a full flop CFR/BR tree.
2. Replace remaining simplified Rust solve payloads with real tree/CFR output surfaced by information set.
3. Add `docs/COMPLETION_REPORT.md` only when the spec-vs-implementation table can honestly be all green.
