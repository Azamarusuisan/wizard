# GTO Lab

Browser-only poker study suite prototype for NLH, PLO4, and PLO5.

This repository currently ships a working TypeScript numerical fallback and a Rust/WASM engine skeleton. The local machine used to create it does not have `cargo`, so the Rust engine is not validated yet.

## Setup

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

## Checks

```bash
pnpm lint
pnpm test
pnpm build
```

`cargo test` and `cargo clippy -- -D warnings` are expected once Rust is installed.

## Architecture

```text
React UI -> Solver Worker -> engine facade
                         -> TypeScript fallback now
                         -> Rust/WASM target later
```

See `docs/ARCHITECTURE.md`.

## Accuracy and Limits

- NLH/PLO hand evaluation, exact-two PLO evaluation, small exact/MC equity, NLH/PLO range parsers, pot-limit sizing, and Kuhn regression are implemented.
- Full postflop NLH/PLO solving, MCCFR, flop/turn abstraction, IndexedDB compressed solve cache, and native WASM threading are deferred.
- PLO5 is computationally expensive; any future precise preset must expose runtime and confidence honestly.

## Fair Use

GTO Lab is for study. Real-time use while playing online poker may violate site rules and is not a supported use case.
