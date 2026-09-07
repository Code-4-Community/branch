/**
 * db CLI -- the schema-adjacent commands that are not migrations themselves.
 *
 *   npm run migrate            apply every pending migration (flyway.sh migrate)
 *   npm run migrate:info       list applied/pending      (flyway.sh info)
 *   npm run migrate:new -- x   scaffold migrations/V<utc>__x.sql
 *   npm run seed               truncate + re-apply seed.sql
 *   npm run seed -- --if-empty seed only an empty database
 *   npm run reset              rebuild the schema from migrations, then seed
 *   npm run fingerprint        record which migrations built the live schema
 *
 * Migrations are Flyway's job -- see flyway.sh. The Makefile in apps/backend
 * wraps all of this; CI calls it directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { MIGRATIONS_DIR, createPool, describeTarget } from './config';
import {
  rebuildSchema,
  resetData,
  seedIfEmpty,
  stampFingerprint,
} from '../testkit';

const TEMPLATE = `-- __NAME__
--
-- Flyway runs this file inside a SINGLE transaction, with search_path =
-- branch, public -- so table names can be unqualified, and CREATE INDEX
-- CONCURRENTLY / VACUUM will not work here.
--
-- This migration is applied to PRODUCTION automatically when the PR merges,
-- BEFORE the new lambda code is deployed. It must be safe for the code that is
-- live right now: additive changes only. See apps/backend/db/README.md for the
-- expand/contract rules that destructive changes need.
--
-- Forward-only: there is no rollback. Fix a mistake with a new migration, and
-- never edit a migration that has been merged -- Flyway checksums it, and
-- someone has already run it. Do not use IF NOT EXISTS: you want a failure, not
-- silent drift.

`;

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
  // concurrent PRs are then effectively impossible. `V<version>__<description>`
  // is Flyway's naming scheme -- the double underscore is the separator, and it
  // cannot be omitted.
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const file = path.join(MIGRATIONS_DIR, `V${stamp}__${name}.sql`);

  fs.writeFileSync(file, TEMPLATE.replace('__NAME__', `V${stamp}__${name}`), {
    flag: 'wx',
  });
  console.log(`created ${path.relative(process.cwd(), file)}`);
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
    case 'new':
      return newMigration(args[0]);
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
        console.log('schema rebuilt from migrations and reseeded');
      });
    // Flyway records what it applied, not which files were on disk when it ran.
    // `make types` refuses to generate from a schema the current migrations did
    // not build, so a real migrate run has to leave the same marker
    // rebuildSchema() does.
    case 'fingerprint':
      return withClient(async (client) => {
        await stampFingerprint(client);
        console.log(`fingerprinted ${describeTarget()}`);
      });
    default:
      console.error('usage: db <new NAME|seed [--if-empty]|reset|fingerprint>');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
