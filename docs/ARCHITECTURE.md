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
- TypeScript fallback implements enough engine behavior for browser demo and tests.
- `crates/engine` keeps the Rust module layout ready for replacement.

## State

- Zustand keeps UI settings and recent results.
- URL query stores shareable spot config as base64url JSON.
- IndexedDB is deferred; localStorage stores lightweight settings only in this slice.
