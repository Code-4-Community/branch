/**
 * db CLI -- the single entrypoint for everything schema related.
 *
 *   npm run migrate            apply every pending migration
 *   npm run migrate:status     list applied/pending
 *   npm run migrate:new -- x   scaffold migrations/<utc>_x.sql
 *   npm run seed               truncate + re-apply seed.sql
 *   npm run seed -- --if-empty seed only an empty database
 *   npm run reset              rebuild the schema from migrations, then seed
 *   npm run db -- stamp NAME   record a migration as applied WITHOUT running it
 *
 * The Makefile in apps/backend wraps these; CI calls them directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'kysely';
import type { PoolClient } from 'pg';
import { SCHEMA, createPool, describeTarget } from './config';
import { createDb, createMigrator } from './migrator';
import { MIGRATIONS_DIR } from './provider';
import {
  migrationsFingerprint,
  rebuildSchema,
  resetData,
  seedIfEmpty,
  stampFingerprint,
} from '../testkit';

const TEMPLATE = `-- __NAME__
--
-- Every pending migration runs inside a SINGLE transaction, with
-- search_path = branch, public -- so table names can be unqualified, and
-- CREATE INDEX CONCURRENTLY / VACUUM will not work here.
--
-- This migration is applied to PRODUCTION automatically when the PR merges,
-- BEFORE the new lambda code is deployed. It must be safe for the code that is
-- live right now: additive changes only. See apps/backend/db/README.md for the
-- expand/contract rules that destructive changes need.
--
-- Forward-only: there is no rollback. Fix a mistake with a new migration, and
-- never edit a migration that has been merged -- someone has already run it.
-- Do not use IF NOT EXISTS: you want a failure, not silent drift.

`;

async function up(): Promise<void> {
  const db = createDb();
  try {
    console.log(`migrating ${describeTarget()}`);
    // migrateToLatest NEVER throws -- it returns the error. Not checking it is
    // the classic way to ship a green deploy that migrated nothing.
    const { error, results } = await createMigrator(db).migrateToLatest();

    for (const result of results ?? []) {
      console.log(`${result.status.padEnd(11)} ${result.migrationName}`);
    }

    if (error) {
      console.error('\nmigration failed, nothing was applied:');
      console.error(error);
      process.exitCode = 1;
      return;
    }

    if (!results?.length) console.log('database is already up to date');

    // Lets db/testkit.ts skip its rebuild when the live schema already matches
    // the migration files on disk. Value is a hex digest, safe to inline.
    await sql
      .raw(
        `comment on schema ${SCHEMA} is 'migrations:${migrationsFingerprint()}'`,
      )
      .execute(db);
  } finally {
    await db.destroy();
  }
}

async function status(): Promise<void> {
  const db = createDb();
  try {
    const migrations = await createMigrator(db).getMigrations();
    if (!migrations.length) {
      console.log(`no *.sql files in ${MIGRATIONS_DIR}`);
      return;
    }

    console.log(`${describeTarget()}\n`);
    for (const migration of migrations) {
      const applied = migration.executedAt?.toISOString() ?? 'PENDING';
      console.log(`${applied.padEnd(26)} ${migration.name}`);
    }

    const pending = migrations.filter(
      (migration) => !migration.executedAt,
    ).length;
    console.log(`\n${migrations.length - pending} applied, ${pending} pending`);
  } finally {
    await db.destroy();
  }
}

function newMigration(name?: string): void {
  if (!name || !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(name)) {
    console.error(
      'usage: npm run migrate:new -- add_expenditure_project_id_index\n' +
        '       (lower_snake_case, letters and digits only)',
    );
    process.exitCode = 1;
    return;
  }

  // UTC YYYYMMDDHHMMSS, generated so nobody hand-types one: collisions between
  // concurrent PRs are then effectively impossible.
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const file = path.join(MIGRATIONS_DIR, `${stamp}_${name}.sql`);

  fs.writeFileSync(file, TEMPLATE.replace('__NAME__', `${stamp}_${name}`), {
    flag: 'wx',
  });
  console.log(`created ${path.relative(process.cwd(), file)}`);
}

/**
 * Record a migration as applied WITHOUT running it. Only for adopting a database
 * whose schema was built by hand -- verify with pg_dump first. The table
 * definitions below are copied from kysely's Migrator so a later migrate run
 * finds exactly what it expects.
 */
async function stamp(name?: string): Promise<void> {
  if (!name) {
    console.error('usage: npm run db -- stamp 0000_baseline_schema');
    process.exitCode = 1;
    return;
  }

  const db = createDb();
  try {
    await sql.raw(`create schema if not exists ${SCHEMA}`).execute(db);
    await sql
      .raw(
        `create table if not exists ${SCHEMA}.kysely_migration (
           name varchar(255) not null primary key,
           "timestamp" varchar(255) not null)`,
      )
      .execute(db);
    await sql
      .raw(
        `create table if not exists ${SCHEMA}.kysely_migration_lock (
           id varchar(255) not null primary key,
           is_locked integer not null default 0)`,
      )
      .execute(db);
    await sql
      .raw(
        `insert into ${SCHEMA}.kysely_migration_lock (id, is_locked)
         values ('migration_lock', 0) on conflict (id) do nothing`,
      )
      .execute(db);
    await sql
      .raw(
        `insert into ${SCHEMA}.kysely_migration (name, "timestamp")
         values ('${name}', '${new Date().toISOString()}')`,
      )
      .execute(db);

    console.log(
      `stamped ${name} as applied (not executed) on ${describeTarget()}`,
    );
  } finally {
    await db.destroy();
  }
}

async function withClient(
  fn: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const pool = createPool();
  const client = await pool.connect();
  try {
    await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'up':
      return up();
    case 'status':
      return status();
    case 'new':
      return newMigration(args[0]);
    case 'stamp':
      return stamp(args[0]);
    case 'seed':
      return withClient(async (client) => {
        if (args.includes('--if-empty')) {
          console.log(
            (await seedIfEmpty(client))
              ? 'seeded'
              : 'database already has data, left alone',
          );
        } else {
          await resetData(client);
          console.log('truncated and reseeded');
        }
      });
    case 'reset':
      return withClient(async (client) => {
        await rebuildSchema(client);
        await resetData(client);
        await stampFingerprint(client);
        console.log('schema rebuilt from migrations and reseeded');
      });
    default:
      console.error(
        'usage: db <up|status|new NAME|seed [--if-empty]|reset|stamp NAME>',
      );
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
