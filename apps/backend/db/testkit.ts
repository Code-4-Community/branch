/**
 * Shared Postgres fixture helpers for the lambda tests and the db CLI.
 *
 * Deliberately dependency-free -- node builtins only, and the caller injects
 * anything with a node-postgres shaped `query(sql)` (a Client, a PoolClient).
 * That is what lets every lambda import this file by relative path
 * (`../../../db/testkit`) without adding a package or a build step, in a repo
 * with no npm workspaces.
 *
 * Typical use in a test file:
 *
 *     beforeAll(async () => { ...await ensureSchema(client) });
 *     beforeEach(async () => { ...await resetData(client) });
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const SCHEMA = 'branch';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEED_PATH = path.join(__dirname, 'seed.sql');

export interface Queryable {
  query(sql: string): Promise<{ rows?: Array<Record<string, unknown>> }>;
}

/**
 * Byte-order sort, matching the sort kysely's Migrator uses to order migrations.
 * If these two ever disagree, tests and production apply migrations in different
 * orders.
 */
function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

let allSql: string | undefined;
function allMigrationSql(): string {
  allSql ??= migrationFiles()
    .map(
      (file) =>
        `-- ${file}\n${fs.readFileSync(
          path.join(MIGRATIONS_DIR, file),
          'utf8',
        )}`,
    )
    .join('\n');
  return allSql;
}

let seed: string | undefined;
function seedSql(): string {
  seed ??= fs.readFileSync(SEED_PATH, 'utf8');
  return seed;
}

/** Hex digest of every migration file, so it is safe to inline into SQL. */
export function migrationsFingerprint(): string {
  return crypto.createHash('sha256').update(allMigrationSql()).digest('hex');
}

/**
 * Writes kysely's migration ledger as if every migration file had just been
 * applied by the Migrator: branch.kysely_migration with one row per file, plus
 * branch.kysely_migration_lock. The DDL is copied from kysely's Migrator so a
 * later `npm run migrate` finds exactly what it expects.
 *
 * Without this, rebuildSchema() would leave a schema whose tables exist but
 * whose ledger is empty -- and since the dev stack and the tests share one local
 * database, the next `make migrate` would try to re-apply every migration and
 * fail on "already exists".
 */
export async function stampLedger(client: Queryable): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.kysely_migration (
       name varchar(255) NOT NULL PRIMARY KEY,
       "timestamp" varchar(255) NOT NULL)`,
  );
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.kysely_migration_lock (
       id varchar(255) NOT NULL PRIMARY KEY,
       is_locked integer NOT NULL DEFAULT 0)`,
  );
  await client.query(
    `INSERT INTO ${SCHEMA}.kysely_migration_lock (id, is_locked)
     VALUES ('migration_lock', 0) ON CONFLICT (id) DO NOTHING`,
  );

  const now = new Date().toISOString();
  const rows = migrationFiles()
    .map((file) => `('${file.slice(0, -'.sql'.length)}', '${now}')`)
    .join(', ');
  if (rows) {
    await client.query(
      `INSERT INTO ${SCHEMA}.kysely_migration (name, "timestamp")
       VALUES ${rows} ON CONFLICT (name) DO NOTHING`,
    );
  }
}

/**
 * Drops schema `branch` and applies every migration file, in order, then records
 * them in the ledger so the result is indistinguishable from a real migration
 * run. Used by the tests and by `make db-reset`.
 */
export async function rebuildSchema(client: Queryable): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await client.query(`CREATE SCHEMA ${SCHEMA}`);
  // Set search_path on the connection rather than inside the migration text: a
  // bare `SET` in a migration file would leak onto a pooled connection.
  await client.query(`SET search_path TO ${SCHEMA}, public`);
  try {
    // A parameterless multi-statement query goes over the simple query protocol
    // and runs as one implicit transaction -- the same all-or-nothing semantics
    // kysely's Migrator gives us in production.
    await client.query(allMigrationSql());
  } finally {
    await client.query('RESET search_path');
  }
  await stampLedger(client);
  await stampFingerprint(client);
}

/**
 * Records which set of migration files built this schema, as a schema comment.
 * A comment rather than a table so it stays invisible to kysely-codegen.
 */
export async function stampFingerprint(client: Queryable): Promise<void> {
  await client.query(
    `COMMENT ON SCHEMA ${SCHEMA} IS 'migrations:${migrationsFingerprint()}'`,
  );
}

async function schemaIsCurrent(client: Queryable): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT obj_description(oid, 'pg_namespace') AS comment
       FROM pg_namespace WHERE nspname = '${SCHEMA}'`,
  );
  return rows?.[0]?.comment === `migrations:${migrationsFingerprint()}`;
}

/**
 * Call once per test file, in `beforeAll`. Rebuilds the schema only when the
 * migration files have changed since it was last built, so adding a migration
 * needs no manual reset and the normal case costs one SELECT.
 */
export async function ensureSchema(client: Queryable): Promise<void> {
  if (!(await schemaIsCurrent(client))) await rebuildSchema(client);
}

/** Fails loudly instead of rebuilding. Used by the type generator. */
export async function assertSchemaIsCurrent(client: Queryable): Promise<void> {
  if (!(await schemaIsCurrent(client))) {
    throw new Error(
      `schema "${SCHEMA}" was not built from the current db/migrations. Run \`make migrate\` (or \`make db-reset\`) first.`,
    );
  }
}

let truncateStatement: string | undefined;
async function truncateAll(client: Queryable): Promise<string> {
  if (truncateStatement === undefined) {
    // Discovered, never hardcoded: a table added by a future migration is reset
    // automatically instead of leaking rows between tests.
    const { rows } = await client.query(
      `SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) AS t
         FROM pg_tables
        WHERE schemaname = '${SCHEMA}' AND tablename NOT LIKE 'kysely_migration%'
        ORDER BY tablename`,
    );
    const tables = (rows ?? []).map((row) => row.t as string);
    if (tables.length === 0) {
      throw new Error(
        `no tables in schema "${SCHEMA}" -- call ensureSchema() first`,
      );
    }
    truncateStatement = `TRUNCATE TABLE ${tables.join(
      ', ',
    )} RESTART IDENTITY CASCADE`;
  }
  return truncateStatement;
}

/**
 * Call in `beforeEach`. Empties every table, restarts every SERIAL sequence at 1,
 * and re-applies seed.sql -- so seeded ids stay deterministic (users 1-3,
 * projects 1-4, donors 1-3) and rows a test creates land on 4+, exactly as they
 * did when tests re-ran the whole of db_setup.sql.
 *
 * Not covered by TRUNCATE: standalone sequences (ones not owned by a serial
 * column) and materialized views. There are none today.
 */
export async function resetData(client: Queryable): Promise<void> {
  await client.query(await truncateAll(client));
  await client.query(seedSql());
}

/**
 * Seeds only a database that has never been seeded, so `make up` does not wipe a
 * locally registered account (or a `make grant-admin` promotion) on restart.
 * Returns whether it seeded.
 */
export async function seedIfEmpty(client: Queryable): Promise<boolean> {
  const { rows } = await client.query(`SELECT 1 FROM ${SCHEMA}.users LIMIT 1`);
  if (rows?.length) return false;
  await resetData(client);
  return true;
}
