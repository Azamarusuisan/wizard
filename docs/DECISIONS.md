# Decisions

## Runtime Split

Options:
- Plan A: Rust/WASM numerical engine.
- Plan B: TypeScript engine with the same API.

Decision:
- Plan A. `docs/ENV_SETUP.log` proves Rust, wasm target, wasm-pack, nightly rust-src, and Playwright Chromium setup completed in this environment.

Reason:
- Native tests and clippy now run locally, so the first-choice path is available.

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
- Bucketing uses fixed-seed k-means++ over ten features: eight equity quantiles plus EHS and EHS2. The seed makes test and cache behavior reproducible.

## Class Counts

Decision:
- Keep canonical class-count gates in Rust tests and replace constant-only checks with exhaustive enumerators as the normalization implementation is completed.

Reason:
- The DoD requires exact class-count tests. Constants are only useful as named targets, not proof.

## Solver Validation Order

Decision:
- Validate in this order: evaluator/equity invariants, Kuhn, Leduc, strict river BR, flop abstraction BR, then PLO MCCFR reporting.

Reason:
- Each later gate depends on the earlier evaluator and terminal EV being correct.
