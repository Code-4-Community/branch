#!/usr/bin/env bash
#
# Build every shared package that declares a `build` script.
#
# Lambdas depend on shared code via `file:` deps (e.g. @branch/lambda-http),
# whose `main` points at a gitignored `dist/`. `npm ci` links a file: dep but
# does not run its build, so each shared package must be compiled before a
# lambda is packaged or tested.
#
# This is the single source of truth for that step: drop a new package under
# shared/ with a `build` script and it's picked up automatically — no workflow
# edits required. Packages without a build script (e.g. shared/types) are
# skipped. Run from the repo root.
set -euo pipefail

for pkg in shared/*/; do
  [ -f "${pkg}package.json" ] || continue
  if node -e "process.exit(require('./${pkg}package.json').scripts?.build ? 0 : 1)"; then
    echo "::group::build ${pkg}"
    npm ci --prefix "$pkg"
    npm run build --prefix "$pkg"
    echo "::endgroup::"
  fi
done
