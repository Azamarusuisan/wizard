# Handoff

## Current State

- Environment setup was executed successfully; logs are in `docs/ENV_SETUP.log`.
- Plan A is active: Rust, wasm target, wasm-pack, nightly rust-src, and Playwright Chromium are available.
- `scripts/verify.sh` exists and currently exits 0 for the tests presently in the repo.
- Rust crate now has modules for `eval`, `iso`, `equity`, `tree`, `cfr`, `br`, and `bucket`.
- CI workflow exists for Node and Rust.
- Production code grep for `TODO|FIXME|未実装|placeholder` is clean.

## Important Caveat

The full Definition of Done is not satisfied. Several gates are represented by shallow tests or fixed gate-return functions and must be replaced with real implementations before completion can be claimed.

## Next Commands

```bash
cd /Users/zettai/gto-lab
. "$HOME/.cargo/env"
bash scripts/verify.sh
```

## Next Implementation Work

1. Replace `cfr::leduc_exploitability`, `br::nlh_river_exploitability_pct_pot`, and `br::nlh_flop_balanced_exploitability_pct_pot` with real CFR/BR code.
2. Replace `iso` constant-only class-count checks with exhaustive canonical enumeration for NLH, PLO4, PLO5, and flop.
3. Move the web solver path from the TypeScript facade to the Rust/WASM EngineAPI.
4. Implement IndexedDB stores and cache-hit E2E.
5. Add `docs/COMPLETION_REPORT.md` only when the spec-vs-implementation table can honestly be all green.
