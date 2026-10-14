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

Production is moving from RDS to Aurora DSQL (see [the cutover](#the-rds--aurora-dsql-cutover)),
and every migration has to run on both. CI enforces all of this with `dsql-lint`:

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
hand-editing `flyway_schema_history` in RDS.

**`outOfOrder` does not extend below the baseline.** `BASELINE_VERSION` in
`flyway.sh` is the version production was adopted at, and Flyway reports anything at
or below it as `Below Baseline` — skipped, permanently, with nothing pending, a
passing `validate` and a green deploy. CI builds from an empty schema, where
baselining never happens, so CI cannot see it either. The `checks` job therefore
fails any new migration whose version is not strictly above `BASELINE_VERSION`. Let
`make new-migration` generate the timestamp and this never comes up.

Files **at or below** the baseline were never run by production, so CI lets them
change. That is how `V0000` came to be a squash of everything up to
`20260907213524`. When production moves to DSQL, which runs every file, set
`BASELINE_VERSION` to `0` and they become immutable like the rest.

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

`V0000__baseline_schema.sql` is the whole schema as of `BASELINE_VERSION`. Before
adopting a database that was built by hand or by the old Kysely migrator, diff it:

```bash
# use a pg_dump matching the server's major version
pg_dump --schema-only --schema=branch --no-owner --no-privileges --no-comments \
        -T 'branch.flyway_schema_history' -T 'branch.kysely_migration*' -d "$URL" | grep -v '^--'
```

Run that against a local database built by `make migrate`, and against the target,
then `diff -u` the two. The only expected differences are the ones the DSQL squash
introduced: `SERIAL` (integer, owned) sequences where V0000 has unowned BIGINT ones,
and `NOT VALID` on the two `ON DELETE RESTRICT` foreign keys.

Then adopt it: Flyway writes a single baseline row at `BASELINE_VERSION` from
`flyway.sh` instead of replaying the files, and everything at or below that version
counts as applied. If the schemas genuinely diverge, write a follow-up migration
reconciling the difference — there is no way to record one file as applied on its
own.

Adoption is **off by default and never happens on a push**: a populated schema with
no history table is far more often a restored snapshot or a clone than the real
production database, and adopting one silently is how you end up migrating the wrong
thing. Run the `Lambda Deploy` workflow by hand with `adopt_baseline` checked, once,
with a human watching. Locally, compose sets `FLYWAY_BASELINE_ON_MIGRATE=true` so a
dev database built before Flyway is adopted without ceremony.

The `migrate` job refuses to run against an **empty** target, on the assumption that
it means `DB_HOST` is pointing somewhere unexpected.

## The RDS → Aurora DSQL cutover

Terraform creates the cluster (`infrastructure/aws/dsql.tf`) and publishes its
endpoint to the lambdas as `DSQL_HOST`, which no lambda reads. `@branch/store` and
`flyway.sh` both switch to IAM auth when `DB_HOST` is a DSQL endpoint, so the whole
move is one Terraform change to `DB_HOST`. Everything before that change is inert.

Run each step from the **DSQL cutover** workflow (`.github/workflows/dsql-cutover.yml`):

1. **`migrate`** builds the schema on the empty cluster from `migrations/`.
2. **Stop writes.** Announce a window. Nothing enforces this, but `copy` notices if
   RDS changed while it ran and fails.
3. **`copy`**, with `confirm` set to the DSQL host. It copies every table in FK order,
   keeping ids and each sequence's counter, then compares a per-table digest and the
   sequences on both sides and checks the rollups against the base tables. If it
   fails: `reset`, then `migrate`, then `copy` again.
4. **Flip** `DB_HOST`/`DB_USER`/`DB_NAME` in `infrastructure/aws/lambda.tf` to
   `local.dsql_endpoint`/`admin`/`postgres`, drop `DB_PASSWORD`, and set
   `BASELINE_VERSION=0` in `flyway.sh`. Merge it, and the lambdas pick DSQL up when
   the apply finishes. To roll back, revert that PR: RDS is untouched and still holds
   the data as of step 2, but nothing written to DSQL after the flip comes with it.
5. **Later:** delete `aws_db_instance.branch_rds` after a final snapshot.

Run `verify` any time before the flip to re-check without writing.

**Local databases built before the squash** still record nine applied versions, and
Flyway refuses to migrate them. Run `make down-v && make up` once.
