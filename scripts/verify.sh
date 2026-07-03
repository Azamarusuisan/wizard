#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

if command -v cargo >/dev/null 2>&1; then
  cargo clippy --workspace -- -D warnings
  cargo test --release --workspace
  wasm-pack build crates/engine --target web --out-dir ../../packages/engine-wasm/pkg
else
  echo "cargo not found" >&2
  exit 1
fi

pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright test

if rg -n "TODO|FIXME|未実装|placeholder" apps/web/src packages/*/src crates/*/src --glob '!**/*.test.ts' --glob '!**/*_test.rs'; then
  echo "Forbidden marker found in production code" >&2
  exit 1
fi
