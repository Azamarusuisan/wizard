# GTO Lab Plan

## M0 Foundation

Done:
- pnpm workspace with `apps/web` and `packages/engine-wasm`.
- Rust crate skeleton in `crates/engine`; current runtime uses the TypeScript engine fallback because this machine has no `cargo`.
- Design tokens, `/dev/ui`, app shell, Dashboard, Range Explorer, Solver Studio, Equity Lab, Trainer, Range Editor, Settings.

Verify:
- `pnpm install`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm dev`, then open `http://localhost:5173/dev/ui`.

## M1 Evaluator

Done:
- Card encoding documented as `rank * 4 + suit`, u64-compatible bit indexing.
- NLH 5/7-card evaluator and PLO exact-two-hole evaluator in TypeScript fallback.
- Suit canonicalization utilities and class-count constants exposed.

Verify:
- `pnpm test` covers hand categories, PLO exact-two rule, NLH benchmark smoke, range parser round trip, pot-limit sizing, and Kuhn CFR convergence.

## M2 Equity Lab

Done:
- 2-6 player exact enumeration when board runouts are small; deterministic Monte Carlo otherwise.
- Weighted ranges via compact text parser for NLH and category PLO syntax.
- UI shows equity, win, tie, confidence mode, and seed.

Verify:
- `pnpm dev`, open Equity Lab, run `AsAh` vs `KcKd`, board empty, Exact.

## M3 CFR Core

Done:
- Kuhn poker CFR regression.
- Toy river solver API returns action mix, EV/EQR/equity rows, exploitability curve, MDF, alpha, SPR.

Verify:
- `pnpm test` checks Kuhn value around `-1/18`.
- Solver Studio "Start solve" streams a convergence curve and renders strategy rows.

## M4-M7 Deferred

Deferred:
- Full Rust/WASM build, rayon threads, real Leduc/NLH flop abstraction, IndexedDB compression, PLO MCCFR, E2E Playwright screenshots.
- These are documented in `docs/DECISIONS.md`; the current app is a working study-suite slice, not a production-grade solver.

Add when:
- `cargo` is available and the numerical engine can be validated natively.
