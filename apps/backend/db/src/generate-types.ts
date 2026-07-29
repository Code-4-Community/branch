/**
 * Regenerates shared/types/db-types.d.ts from the live database.
 *
 * This is the ONLY place the kysely-codegen invocation lives --
 * .github/workflows/regenerate-db-types.yaml runs this same script, so local and
 * CI output are identical by construction rather than by convention.
 *
 *     npm run types          (or `make types` / `make migrate` from apps/backend)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPool, databaseUrl } from './config';
import { assertSchemaIsCurrent } from '../testkit';
import { postprocess } from './postprocess-types';

/**
 * Where to write the generated types. TYPES_OUT exists because `make types` runs
 * this inside the migrator container, where the repo root is not an ancestor of
 * __dirname -- the Makefile bind-mounts shared/types and points TYPES_OUT at it.
 * CI and a direct `npm run types` use the repo-relative default.
 */
const OUT = process.env.TYPES_OUT
  ? path.resolve(process.env.TYPES_OUT)
  : path.resolve(__dirname, '../../../../shared/types/db-types.d.ts');

async function main(): Promise<void> {
  // Generating from a database that is behind db/migrations silently produces
  // stale types, so refuse instead of guessing.
  const pool = createPool();
  const client = await pool.connect();
  try {
    await assertSchemaIsCurrent(client);
  } finally {
    client.release();
    await pool.end();
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-types-'));
  const tmp = path.join(tmpDir, 'db-types.d.ts');

  execFileSync(
    path.resolve(__dirname, '../node_modules/.bin/kysely-codegen'),
    [
      '--url',
      databaseUrl(),
      '--dialect',
      'postgres',
      // Ignore anything created outside schema "branch". kysely already excludes
      // kysely_migration / kysely_migration_lock by name.
      //
      // Deliberately NOT --default-schema: that would strip the `branch.` prefix
      // from the generated DB keys and break every db.selectFrom('branch.users')
      // in all six lambdas.
      '--include-pattern',
      'branch.*',
      '--out-file',
      tmp,
    ],
    { stdio: 'inherit' },
  );

  fs.writeFileSync(OUT, postprocess(fs.readFileSync(tmp, 'utf8')));
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
