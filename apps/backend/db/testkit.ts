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
 * Byte-order sort. Flyway orders by parsed version rather than by filename, but
 * `V<zero-padded digits>__` sorts identically either way. If that ever stops
 * being true, tests and production apply migrations in different orders.
 */
function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

// Must stay in step with the `-placeholders.*` flags in flyway.sh; tests apply the SQL directly.
const PLACEHOLDERS: Record<string, string> = { async: '' };

function substitutePlaceholders(sql: string, file: string): string {
  return sql.replace(/\$\{(\w+)\}/g, (match, name: string) => {
    const value = PLACEHOLDERS[name];
    if (value === undefined) {
      throw new Error(
        `${file}: unknown Flyway placeholder ${match} -- define it in flyway.sh and in PLACEHOLDERS here`,
      );
    }
    return value;
  });
}

let allSql: string | undefined;
function allMigrationSql(): string {
  allSql ??= migrationFiles()
    .map(
      (file) =>
        `-- ${file}\n${substitutePlaceholders(
          fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
          file,
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

export const HISTORY_TABLE = 'flyway_schema_history';

/**
 * Writes Flyway's history as if every migration file had just been applied. The
 * DDL is copied from what Flyway itself creates on PostgreSQL, so a later
 * `npm run migrate` finds exactly what it expects.
 *
 * Without this, rebuildSchema() would leave a schema whose tables exist but
 * whose history is empty -- and since the dev stack and the tests share one
 * local database, the next `make migrate` would re-apply every migration,
 * failing on "already exists".
 */
export async function stampLedger(client: Queryable): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.${HISTORY_TABLE} (
       installed_rank integer NOT NULL PRIMARY KEY,
       version varchar(50),
       description varchar(200) NOT NULL,
       type varchar(20) NOT NULL,
       script varchar(1000) NOT NULL,
       checksum integer,
       installed_by varchar(100) NOT NULL,
       installed_on timestamp NOT NULL DEFAULT now(),
       execution_time integer NOT NULL,
       success boolean NOT NULL)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${HISTORY_TABLE}_s_idx
       ON ${SCHEMA}.${HISTORY_TABLE} (success)`,
  );

  // Flyway stores the description with the underscores turned back into spaces.
  const rows = migrationFiles()
    .map((file, index) => {
      const [version, description] = file
        .slice(1, -'.sql'.length)
        .split('__', 2);
      return (
        `(${index + 1}, '${version}', '${description.replace(/_/g, ' ')}',` +
        ` 'SQL', '${file}', NULL, current_user, 0, TRUE)`
      );
    })
    .join(', ');
  if (rows) {
    await client.query(
      `INSERT INTO ${SCHEMA}.${HISTORY_TABLE}
         (installed_rank, version, description, type, script, checksum,
          installed_by, execution_time, success)
       VALUES ${rows} ON CONFLICT (installed_rank) DO NOTHING`,
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
    // and runs as one implicit transaction. Flyway commits per file rather than
    // per run, so this is stricter than production, not looser.
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
        WHERE schemaname = '${SCHEMA}' AND tablename <> '${HISTORY_TABLE}'
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

// The id sequences are unowned (DSQL has no ALTER SEQUENCE ... OWNED BY), so RESTART IDENTITY skips them.
const RESTART_SEQUENCES = `
  SELECT setval(format('%I.%I', schemaname, sequencename), 1, false)
    FROM pg_sequences WHERE schemaname = '${SCHEMA}'`;

/**
 * Call in `beforeEach`. Empties every table, restarts every id sequence at 1,
 * and re-applies seed.sql -- so seeded ids stay deterministic (users 1-3,
 * projects 1-4, donors 1-3) and rows a test creates land on 4+, exactly as they
 * did when tests re-ran the whole of db_setup.sql.
 */
export async function resetData(client: Queryable): Promise<void> {
  await client.query(await truncateAll(client));
  await client.query(RESTART_SEQUENCES);
  await client.query(seedSql());
}

export async function purgeSoftDeleted(client: Queryable): Promise<void> {
  for (const table of ['expenditures', 'reports', 'project_donations', 'donors', 'projects', 'users']) {
    await client.query(`DELETE FROM ${SCHEMA}.${table} WHERE deleted_at IS NOT NULL`);
  }
}

export const PARITY_DELETES = {
  expenditure: 1,
  donation: 2,
  donor: 3,
  report: 4,
  project: 3,
  user: 5,
} as const;

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
