# Database migrations

Schema changes are plain `.sql` files in `migrations/`, applied by
[Flyway](https://documentation.red-gate.com/flyway). They are applied to
**production automatically when your PR merges**.

## Changing the schema

```bash
cd apps/backend
make up                                   # if the stack isn't already running

make new-migration NAME=add_expenditure_notes   # creates migrations/V<utc>__add_expenditure_notes.sql
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

- `migrations/V<version>__<description>.sql` — applied in version order.
  `make new-migration` generates a UTC `VYYYYMMDDHHMMSS__` prefix so concurrent PRs
  can't collide. The double underscore is Flyway's separator and is not optional.
- `seed.sql` — dev/test data only, **never applied to production**.
- `testkit.ts` — `ensureSchema()` / `resetData()` used by the lambda tests.
- `flyway.sh` — the only place Flyway is configured. Uses the flyway on `PATH`,
  otherwise the pinned image, so docker is the only prerequisite.
- `src/` — seeding and schema-rebuild commands, the type generator, and the shared
  post-processing that keeps local and CI type output byte-identical.

**What's applied is tracked in the database**, in `branch.flyway_schema_history` —
one row per applied migration, including a checksum of the file. "Pending" is the
`.sql` files on disk minus the rows in that table. It's an ordinary table, so in any
environment:

```sql
select version, description, checksum, success from branch.flyway_schema_history
 order by installed_rank;
```

The checksum is why a merged migration can never be edited: Flyway compares the file
against the recorded checksum on the next run and fails the deploy.

Each migration file runs inside its **own transaction** with
`search_path = branch, public`, so table names can be unqualified and a failure
part-way through a file rolls that file back. That's also why `CREATE INDEX
CONCURRENTLY` and `VACUUM` don't work here — they can't run in a transaction.

## Writing for Aurora DSQL

Production runs on Aurora DSQL, while local dev and CI run Postgres, so every
migration has to run on both. CI enforces all of this with `dsql-lint`:

- **One DDL statement per file, and no DML beside it.** DSQL allows one DDL per
  transaction and never mixes it with `INSERT`/`UPDATE`/`DELETE`. A backfill is its own
  migration. (`V0000` is the one exception: its `.sql.conf` sets
  `executeInTransaction=false`.)
- **`CREATE INDEX ${async} ...`** — DSQL builds every index asynchronously. Flyway waits
  for the build before the next migration.
- **No `SERIAL`, triggers, PL/pgSQL or `TRUNCATE`.** Ids come from a
  `CREATE SEQUENCE ... CACHE 1` (its own migration) and `INT DEFAULT nextval(...)`.
  `LANGUAGE sql` functions are fine.
- **At most 3,000 rows changed**, cascades included.
- **Always give `NUMERIC` a precision and scale.** DSQL stores a bare `NUMERIC` as
  `numeric(18,6)`, so `12.34` comes back as `12.340000`.

`${async}` in a migration is a Flyway placeholder. It expands to nothing on
PostgreSQL and to `ASYNC` on Aurora DSQL (`flyway.sh` switches on a DSQL `DB_HOST`).
Placeholders are Flyway's, so `testkit.ts` substitutes them itself when it applies
the files directly — add any new one to `PLACEHOLDERS` there as well as to
`flyway.sh`, or the tests fail on a postgres syntax error.

Against a DSQL host, `flyway.sh` connects as `admin` to database `postgres` with an
IAM token it mints from the caller's AWS credentials. It also mounts the pinned
`flyway-database-dsql` plugin, which the Flyway CLI does not bundle.

Out-of-order merges are allowed (`outOfOrder`): if your migration merges after
someone whose timestamp is later, it simply applies late. The alternative — the
default — is a production deploy that fails and can only be unblocked by
hand-editing `flyway_schema_history` on the cluster.

## In CI

| When | What happens |
| --- | --- |
| PR opened/updated with a migration | A bot posts a checklist comment. `migrations-fresh` applies every migration to an empty Postgres, checks idempotency, and verifies the committed types match. `migrations-guard` rejects edits to already-merged migrations, bad filenames, and unsafe SQL. |
| Types are stale | The `Schema Change Checks` workflow regenerates `shared/types/db-types.d.ts` and pushes it to your branch. **Expect one red `migrations-fresh` run before that commit lands** — that's normal, not a flake. |
| PR merges to main | The `migrate` job in `lambda-deploy.yml` applies pending migrations to the DSQL cluster, and only then lets the lambda zips deploy. A failed migration blocks the code deploy. |
| Preview environments | Migrations are **never** applied there — previews share the production database. A PR that adds a migration cannot be fully previewed; endpoints using the new columns will fail until it merges. |

If a migration fails in CI, production is left on the old schema **and** the old
code. Fix it forward with a new commit.

**There is no pre-migration snapshot.** DSQL has no `CreateDBSnapshot`, and no AWS
Backup plan covers the cluster yet, so a bad migration is fixed forward. The last
RDS snapshot, `branch-rds-final-20261015`, holds the data as of the cutover.

The `migrate` job refuses to run against an **empty** target, on the assumption that
it means `DB_HOST` is pointing somewhere unexpected, and against a populated schema
with no Flyway history, which is a clone rather than production.

## History

Production moved from RDS Postgres 17 to Aurora DSQL on 2026-10-15 (#404–#406), and
RDS was deleted afterwards. `V0000` is a DSQL-shaped squash of the RDS-era
migrations; nothing has ever run it against RDS.


**Local databases built before the squash** still record nine applied versions, and
Flyway refuses to migrate them. Run `make down-v && make up` once.
