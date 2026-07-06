# Architecture

```text
apps/web
  React shell + pages + Zustand state
  src/workers/solver.worker.ts
    request id / progress / done / cancel protocol
  src/engine/*
    browser-safe TypeScript numerical fallback

packages/engine-wasm
  public API facade
  prefers generated Rust/WASM pkg, falls back to TypeScript

crates/engine
  Rust native/WASM engine: eval, iso, equity, tree, cfr, br, bucket
```

## Data Flow

1. UI builds a normalized spot config.
2. Solver worker receives `{ id, type, payload }`.
3. Worker calls the engine facade.
4. Progress events stream exploitability points.
5. Results contain node metrics, combo rows, range weights, hand classes, blocker metrics, action mix, and spot indicators.

## WASM Boundary

Target boundary:
- Rust owns cards, evaluator, equity enumeration, game tree, CFR, and abstraction.
- TypeScript owns UI state, i18n, persistence, WebCrypto cache key hashing, worker protocol, charts, and formatting.

Current boundary:
- Rust builds natively and through `wasm-pack`.
- `EngineAPI` uses Rust/WASM when `packages/engine-wasm/pkg` exists and TypeScript otherwise.
- The current production solve result is compact NLH range rows with exact board-aware equities, range weights, hand classes, blocker metrics, public low/mid/high chance branch nodes for flop/turn navigation, and PLO4/PLO5 Fast capped representative rows with board-aware sampled equities. The chance branch nodes derive their own compact strategy/metric tables from shifted branch equities; this is not the final full postflop tree/MCCFR implementation.

## State

- Zustand keeps UI settings and recent results.
- URL query stores shareable spot config as base64url JSON.
- IndexedDB stores solve cache, custom ranges, and training data. Solve cache keys are SHA-256 of canonical JSON spot configs.

## Memory Budget Targets

Core CFR tables are flat typed arrays. The planning formula is:

```text
bytes = public_nodes * combos_per_player * avg_actions * tables_per_action * bytes_per_value
```

`tables_per_action` is 2 for regret plus average strategy. Terminal EV, reach, and scratch buffers are budgeted separately because they are streamed or reused per street.

| Preset | Public nodes | Combos/player | Avg actions | Action tables | Value type | CFR table | Scratch/EV budget | Browser target |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| NLH river small | 200 | 1,326 | 3 | 2 | `Float32` | 6.1 MB | 24 MB | < 64 MB |
| NLH turn balanced | 3,000 | 1,326 | 3 | 2 | `Float32` | 95.5 MB | 160 MB | < 320 MB |
| NLH flop balanced | 12,000 | 1,326 | 3 | 2 | `Float32` | 382.0 MB | 320 MB | < 768 MB |
| PLO4 fast MCCFR | 2,000 | 20,000 cap | 3 | 2 | `Float32` | 960.0 MB | 256 MB | < 1.5 GB |
| PLO5 fast MCCFR | 1,000 | 30,000 cap | 3 | 2 | `Float32` | 720.0 MB | 384 MB | < 1.5 GB |

Default browser solving must stay under these caps by pruning impossible combos, applying card abstraction before allocating regret tables, using PLO combo caps, and storing terminal EV tables as `Float32`. Precise NLH can exceed the default cap only after an explicit estimate is shown in the UI.
