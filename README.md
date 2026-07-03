# GTO Lab

Browser-only poker study suite for NLH, PLO4, and PLO5.

## Setup

```bash
pnpm install
bash scripts/verify.sh
pnpm dev
```

Open `http://localhost:5173`.

## Benchmarks

```bash
cargo bench -p gto_lab_engine --bench engine_bench
```

Latest local run: `nlh7_eval` ~1.07 us/eval, `default_river_solve` ~12.8 ns/row-set on this machine.

## Current Engine Path

Plan A is active: Rust, `wasm32-unknown-unknown`, `wasm-pack`, and Playwright Chromium are installed and logged in `docs/ENV_SETUP.log`.

The web app calls `packages/engine-wasm`, which prefers the generated Rust/WASM package and falls back to the local TypeScript engine only when the generated package is unavailable.

## Architecture

```text
React UI -> Solver Worker -> EngineAPI facade -> Rust/WASM
                                           -> TypeScript fallback
IndexedDB <- solve cache / ranges / training
```

See `docs/ARCHITECTURE.md`.

## Accuracy and Limits

- Implemented: NLH/PLO hand evaluation, exact-two PLO evaluation, exact and Monte Carlo equity with 2-6 players and dead cards, range parsers, pot-limit sizing, Kuhn/Leduc gates, default NLH river combo rows, PLO4/PLO5 Fast BR reporting, IndexedDB solve cache, and Playwright flows.
- Current limitation: the production solve path is still default-combo river solving, not the required full postflop CFR tree. NLH flop Balanced and PLO Fast gates currently use compact abstractions/proxies.
- PLO5 is computationally expensive; current Fast reporting is sampled and must be replaced by the requested MCCFR path before completion.

Completion is defined only by `/Users/zettai/Downloads/codex-prompt-completion-directive.md` §6. This repository is not complete until that checklist is fully proven.

## Fair Use

GTO Lab is for study. Real-time use while playing online poker may violate site rules and is not a supported use case.
