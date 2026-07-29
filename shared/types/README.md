# @branch/types

Shared type definitions for the Branch lambdas. This replaces the per-lambda copies of `db-types.d.ts` and the duplicated auth interfaces (`AuthenticatedUser`, `AuthContext`, etc.).

## What's in here

| File | Contents |
|------|----------|
| `db-types.d.ts` | Kysely row types generated from `apps/backend/db/migrations/**` (`DB`, `BranchUsers`, `BranchProjects`, ...) |
| `auth-types.d.ts` | Auth DTOs (`AuthenticatedUser`, `AuthContext`, `AccessLevel`, `AuthorizationCheck`) |

## How it works

The package is **types-only** — it contains no runtime code and has no dependencies. Each lambda references it via a `file:` dependency in its `package.json`:

```json
"devDependencies": {
  "@branch/types": "file:../../../../shared/types"
}
```

Because the package only ships `.d.ts` files, all imports are erased at compile time. The deployed `lambda.zip` (built from `dist/`) is unaffected, so lambdas remain fully self contained.

## Usage

```ts
import type { DB } from '@branch/types';
import type { AuthContext, AuthenticatedUser } from '@branch/types';
```

Note: `db-types.d.ts` defines a local `ColumnType` that is structurally identical to kysely's, so the package itself does not depend on kysely.

## Regenerating DB types

`db-types.d.ts` is regenerated automatically by the `Schema Change Checks` GitHub workflow whenever `apps/backend/db/migrations/**` changes, and locally by `make migrate` / `make types` in `apps/backend`. Do not edit it manually.

## New lambdas

`tools/lambda-cli.js init-handler <name>` adds this package to new lambdas automatically.
