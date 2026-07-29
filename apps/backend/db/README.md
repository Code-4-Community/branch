# Database migrations

Schema changes are plain `.sql` files in `migrations/`, applied by [kysely's
`Migrator`](https://kysely.dev/docs/migrations). They are applied to **production
automatically when your PR merges**.

## Changing the schema

```bash
cd apps/backend
make up                                   # if the stack isn't already running

make new-migration NAME=add_expenditure_notes   # creates migrations/<utc>_add_expenditure_notes.sql
# ...write your SQL...
make migrate                              # applies it, reseeds if empty, regenerates types, prints status
```

Then run the tests for any lambda you touched (`cd lambdas/<name> && npm test`) and
commit `migrations/*.sql` **together with** `shared/types/db-types.d.ts`.

Other commands: `make show-migrations` (what's applied vs pending), `make seed`
(truncate + reseed), `make db-reset` (rebuild the schema from scratch),
`make types` (regenerate types only).

## The one rule that matters

**Migrations run against production BEFORE the new lambda code is deployed.** For
that window — and indefinitely, if the deploy fails — the **currently deployed
code runs against your new schema**. So:

> Every migration must be safe for the code that is live right now.

**Safe in a single PR (expand):**

- `CREATE TABLE`
- `ADD COLUMN` that is nullable, or `NOT NULL DEFAULT <constant>`
- `CREATE INDEX` (not `CONCURRENTLY` — see below)
- widening a type (`VARCHAR(100)` → `VARCHAR(200)`, `INT` → `BIGINT`)
- `ALTER TYPE ... ADD VALUE`
- backfilling data into columns the live code doesn't read

**Requires two merged PRs (expand, then contract):**

- `DROP COLUMN` / `DROP TABLE` — PR 1 stops the code using it and deploys; PR 2 drops it
- **renames** — PR 1 adds the new column, backfills, and writes both; PR 2 reads the
  new one; PR 3 drops the old one
- `ADD COLUMN NOT NULL` with no default — the live code's `INSERT`s omit it and start
  failing immediately
- adding `UNIQUE` / `CHECK` / `FOREIGN KEY` that live data or live code could violate
- narrowing a type, or `SET NOT NULL` on an existing nullable column

CI rejects the destructive statements outright. If you genuinely are doing the
contract half of an expand/contract, add `-- allow-destructive: <reason>` at the top
of the migration.

**There is no `down`.** Production is forward-only: to undo a bad migration, write a
new one. Never edit a migration that has been merged — someone has already run it,
and CI will reject the change.

## How it works

- `migrations/*.sql` — applied in filename order. `make new-migration` generates a
  UTC `YYYYMMDDHHMMSS_` prefix so concurrent PRs can't collide.
- `seed.sql` — dev/test data only, **never applied to production**.
- `testkit.ts` — `ensureSchema()` / `resetData()` used by the lambda tests.
- `src/` — the runner CLI, the type generator, and the shared post-processing that
  keeps local and CI type output byte-identical.

**What's applied is tracked in the database**, in `branch.kysely_migration` — one row
per applied migration (`name`, `timestamp`). "Pending" is just the `.sql` files on
disk minus the rows in that table. It's an ordinary table, so in any environment:

```sql
select * from branch.kysely_migration order by name;
```

All pending migrations run inside a **single transaction** with
`search_path = branch, public`, so table names can be unqualified and a failure
part-way through rolls the whole run back. That's also why `CREATE INDEX
CONCURRENTLY` and `VACUUM` don't work here — they can't run in a transaction. This
database is tiny; a plain `CREATE INDEX` is fine.

Out-of-order merges are allowed (`allowUnorderedMigrations`): if your migration
merges after someone whose timestamp is later, it simply applies late. The
alternative — the default — is a production deploy that fails with `corrupted
migrations` and can only be unblocked by hand-editing `kysely_migration` in RDS.

## In CI

| When | What happens |
| --- | --- |
| PR opened/updated with a migration | A bot posts a checklist comment. `migrations-fresh` applies every migration to an empty Postgres, checks idempotency, and verifies the committed types match. `migrations-guard` rejects edits to already-merged migrations, bad filenames, and unsafe SQL. |
| Types are stale | The `Schema Change Checks` workflow regenerates `shared/types/db-types.d.ts` and pushes it to your branch. **Expect one red `migrations-fresh` run before that commit lands** — that's normal, not a flake. |
| PR merges to main | The `migrate` job in `lambda-deploy.yml` snapshots RDS, applies pending migrations, and only then lets the lambda zips deploy. A failed migration blocks the code deploy. |
| Preview environments | Migrations are **never** applied there — previews share the production database. A PR that adds a migration cannot be fully previewed; endpoints using the new columns will fail until it merges. |

If a migration fails in CI, production is left on the old schema **and** the old
code. Fix it forward with a new commit.

Two rollback levers exist, both free at this database's size and both a ~20-minute
manual restore-into-a-new-instance procedure, not a button:

- a `branch-premigrate-<utc>-<sha>` snapshot taken before every migration run, tagged
  with the commit. The five most recent are kept — manual snapshots never expire on
  their own, so the job prunes older ones.
- 7 days of point-in-time recovery (`backup_retention_period` in
  `infrastructure/aws/main.tf`), which can restore to any second in the window.

## One-time: adopting an existing database

`0000_baseline_schema.sql` is the schema as it existed before migrations, and is the
only migration allowed to use `IF NOT EXISTS` — that's what lets it be applied to a
database that already has these tables.

`IF NOT EXISTS` skips the **entire** `CREATE TABLE` when the table exists, so it
cannot detect a column or constraint that differs. Before running the migrator
against a pre-existing database, diff it:

```bash
# use a pg_dump matching the server's major version
pg_dump --schema-only --schema=branch --no-owner --no-privileges --no-comments \
        -T 'branch.kysely_migration*' -d "$URL" | grep -v '^--'
```

Run that against a local database with only the baseline applied, and against the
target; `diff -u` the two. Once it's empty, run `npm run migrate` against the target
with a human watching — the baseline no-ops and records itself in the ledger.

If the schemas genuinely diverge, use `npm run db -- stamp 0000_baseline_schema` to
record it without executing, then write a follow-up migration reconciling the
difference.

The `migrate` job refuses to run if `0000_baseline_schema` is still pending, on the
assumption that it means `DB_HOST` is pointing somewhere unexpected.
