# Architecture

```text
apps/web
  React shell + pages + Zustand state
  src/workers/solver.worker.ts
    request id / progress / done / cancel protocol
  src/engine/*
    browser-safe TypeScript numerical fallback

packages/engine-wasm
  public API facade, currently re-exporting TS fallback types

crates/engine
  Rust target shape for the native/WASM engine
```

## Data Flow

1. UI builds a normalized spot config.
2. Solver worker receives `{ id, type, payload }`.
3. Worker calls the engine facade.
4. Progress events stream exploitability points.
5. Results contain node metrics, combo rows, action mix, and spot indicators.

## WASM Boundary

Target boundary:
- Rust owns cards, evaluator, equity enumeration, game tree, CFR, abstraction, and cache key hashing.
- TypeScript owns UI state, i18n, persistence, worker protocol, charts, and formatting.

Current boundary:
- Rust builds natively and through `wasm-pack`.
- The React app still calls the TypeScript facade while Rust exports are expanded to the full EngineAPI.

## State

- Zustand keeps UI settings and recent results.
- URL query stores shareable spot config as base64url JSON.
- IndexedDB is deferred; localStorage stores lightweight settings only in this slice.

## Memory Budget Targets

| Tree | Combos/player | Nodes | Actions | Float tables | Approx |
|---|---:|---:|---:|---:|---:|
| NLH river small | 1,326 | 200 | 3 | regret + strategy + EV | 19 MB |
| NLH turn balanced | 1,326 | 3,000 | 3 | regret + strategy | 191 MB |
| NLH flop balanced | 1,326 | 12,000 | 3 | regret + strategy, bucketed chance | 764 MB |
| PLO4 fast | capped 20,000 | 2,000 | 3 | bucket/node flat arrays | 960 MB |

Default browser solving must stay under these caps by pruning impossible combos, bucketing chance nodes, and storing terminal EV tables as `Float32`.
