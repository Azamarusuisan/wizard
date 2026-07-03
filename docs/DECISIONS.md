# Decisions

## Runtime Split

Options:
- Build Rust/WASM now.
- Ship a TypeScript fallback and Rust skeleton.

Decision:
- Ship TypeScript fallback. This machine has no `cargo`, so native validation is impossible here. The UI and API stay shaped around a future WASM engine.

## PLO Preflop

Options:
- Attempt equilibrium preflop solving.
- Use category ranges plus equity support.

Decision:
- Use category ranges. PLO4/PLO5 preflop equilibrium solving is too large for a browser-only first version and was explicitly allowed as heuristic.

## Abstraction Presets

Decision:
- Fast: 32 buckets, 6k MC samples.
- Balanced: 96 buckets, 25k MC samples.
- Precise: 256 buckets, 100k MC samples.

Reason:
- Browser workers need predictable latency. The UI reports approximation status rather than pretending exactness.

## Class Counts

Decision:
- The app exposes required canonical counts as constants and tests the canonicalizer on representative cases. Full PLO5 exhaustive enumeration is deferred because it is too slow for normal CI in this environment.

## Solver Scope

Decision:
- Kuhn CFR and toy river solving are implemented. Full NLH/PLO postflop solving is deferred until the Rust engine is runnable.

Reason:
- A fake full solver would be worse than an honest bounded solver.
