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
- The current production solve result is compact NLH range rows with exact board-aware equities, range weights, hand classes, blocker metrics, and PLO4/PLO5 Fast sampled rows, not the final full postflop tree/MCCFR implementation.

## State

- Zustand keeps UI settings and recent results.
- URL query stores shareable spot config as base64url JSON.
- IndexedDB stores solve cache, custom ranges, and training data. Solve cache keys are SHA-256 of canonical JSON spot configs.

## Memory Budget Targets

| Tree | Combos/player | Nodes | Actions | Float tables | Approx |
|---|---:|---:|---:|---:|---:|
| NLH river small | 1,326 | 200 | 3 | regret + strategy + EV | 19 MB |
| NLH turn balanced | 1,326 | 3,000 | 3 | regret + strategy | 191 MB |
| NLH flop balanced | 1,326 | 12,000 | 3 | regret + strategy, bucketed chance | 764 MB |
| PLO4 fast | capped 20,000 | 2,000 | 3 | bucket/node flat arrays | 960 MB |

Default browser solving must stay under these caps by pruning impossible combos, bucketing chance nodes, and storing terminal EV tables as `Float32`.
