# GTO Lab Plan

Completion is defined only by `/Users/zettai/Downloads/codex-prompt-completion-directive.md` §6. This plan records current evidence and remaining work; it does not narrow the scope.

## M0 Foundation

Evidence:
- pnpm workspace with `apps/web`, `packages/engine-wasm`, and Rust workspace `crates/engine`.
- Plan A environment is available; setup output is in `docs/ENV_SETUP.log`.
- `scripts/verify.sh` runs Rust clippy, Rust release tests, wasm-pack, TypeScript checks, build, Playwright, and forbidden-marker grep.
- Design tokens, `/dev/ui`, app shell, Dashboard, Range Explorer, Solver Studio, Equity Lab, Trainer, Range Editor, and Settings exist.

Verify:
- `bash scripts/verify.sh`
- `pnpm dev`, open `http://localhost:5173/dev/ui`.

## M1 Evaluator

Evidence:
- Card encoding is `rank * 4 + suit`.
- Rust implements NLH 5/7-card evaluation and PLO4/PLO5 exact two-hole/three-board evaluation. NLH7 uses direct rank/suit counting and is tested against brute-force best-five examples.
- Exhaustive class-count tests cover NLH 169, PLO4 16,432, PLO5 134,459, and flop 1,755.
- Criterion benches exist for `nlh7_eval` and default river rows.

Verify:
- `cargo test --release -p gto_lab_engine`
- `cargo bench -p gto_lab_engine --bench engine_bench`

Current benchmark:
- Latest local `cargo bench -p gto_lab_engine --bench engine_bench`: `nlh7_eval` ~11.66 ns/eval, exceeding the 50M eval/s target on this machine.

## M2 Equity Lab

Evidence:
- Exact and Monte Carlo NLH equity paths are implemented with seeded MC confidence intervals.
- Tests cover AA vs KK, AKs vs QQ, mirror-suit invariance, MC-vs-exact agreement, and PLO exact-two rule.
- TypeScript equity validates NLH/PLO4/PLO5 hole counts and supports dead cards.
- Web Equity Lab supports 2-6 player slots, NLH/PLO4/PLO5 selection, dead cards, Auto/Exact/MC mode, iterations, win/tie display, CI, and validation errors; Playwright covers NLH, PLO5 exact board, 3-way, manual MC, and dead-card duplicate flows.

Verify:
- `cargo test --release -p gto_lab_engine`
- `pnpm exec playwright test apps/web/tests/core-flows.spec.ts -g "equity lab"`

## M3 CFR Core

Evidence:
- Kuhn CFR and Leduc CFR/BR probes are automatic Rust gates.
- NLH river exploitability is computed from action EVs and strategy rows.
- Solver worker supports progress, cancel, cache hit, and `?spot=<base64url-json>` share URLs.

Verify:
- `cargo test --release -p gto_lab_engine`
- `pnpm exec playwright test apps/web/tests/core-flows.spec.ts -g "solver runs"`

Remaining:
- Replace compact river range-row output with real tree/CFR output.
- Implement strict full-tree best response for production NLH postflop nodes.

## M4 NLH Full Postflop

Evidence:
- Current NLH flop Balanced gate uses a compact flop-to-river continuation abstraction over representative buckets and passes the numeric threshold.
- Rust bucket tests cover fixed-seed 10-feature k-means++ and verify within-cluster variance does not worsen when bucket count increases.
- Rust solver gates now compute compact flop abstraction exploitability from card-derived flop buckets instead of synthetic equity rows.
- Compact NLH flop chance branches are derived from exact enumeration of all remaining turn/river runouts, then compressed into low/mid/high equity quantiles.
- Solver payloads now expose public chance branch nodes for flop-to-turn and turn-to-river low/mid/high buckets, plus destination-street bet-response child nodes under those branches. NLH nodes derive branch-specific compact strategy/metric tables from next-street card equity quantiles and the configured turn/river bet-tree sizes while the full continuation tree remains pending.
- Auxiliary raise-size information sets now expose size-mix EV/EQR instead of root metrics.
- Bet-response node metrics apply configured rake in Rust native, TypeScript fallback, and Solver Studio preview.

Remaining:
- Implement full flop/turn public tree construction, card abstraction, terminal EV, strict BR, rake handling, and solve serialization for real information sets.

## M5 PLO4/PLO5

Evidence:
- PLO evaluator and PLO4/PLO5 Fast capped representative CFR/BR reporting exist.
- PLO4 AAxx double-suited-over-rainbow monotonicity is tested.
- PLO Fast now applies the Solver Studio Hero range PLO syntax as a category filter and weight multiplier over the capped representative sample set.
- PLO Fast applies Villain range PLO syntax to the opponent representative set used by blocker analysis.
- PLO Fast representative equities are now sampled against the Villain representative set when supplied, falling back to random-hand MC only when no unblocked opponent representative exists.
- PLO Fast standalone exploitability gates use the same weighted representative opponent model as the solve path.
- PLO Fast metrics expose both hero and opponent representative counts and weight coverage.

Remaining:
- Replace capped representative Fast reporting with external-sampling MCCFR, stratified range caps, PLO bucket tables, and full UI approximation disclosure.

## M6 Trainer And Range Editor

Evidence:
- Trainer scores actions from action EVs and displays EV loss, grade, and GTO frequency.
- Range Editor saves/loads ranges in IndexedDB, imports/exports range JSON, and is covered by Playwright.
- NLH and PLO text parsers have round-trip or smoke tests.

Verify:
- `pnpm test`
- `pnpm exec playwright test apps/web/tests/core-flows.spec.ts -g "trainer|range editor"`

Remaining:
- Replace trainer source spots with real solved tree nodes after M4/M5.

## M7 Polish And Completion Report

Evidence:
- Playwright covers solver, equity, trainer, range editor persistence, cache clearing, and COOP/COEP headers.
- README includes setup, current Plan A state, limits, benchmarks, and RTA warning.

Remaining:
- Produce `docs/COMPLETION_REPORT.md` only after all §6 requirements are truly complete.
- Include full `scripts/verify.sh` output, all-green spec matrix, measured performance table, exploitability table, and screen evidence.
