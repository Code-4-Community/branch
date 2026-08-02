import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'kysely';
import type { Kysely, Migration, MigrationProvider } from 'kysely';

export const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/** Byte-order sort, matching what kysely uses internally to order migrations. */
export function migrationFilenames(dir: string = MIGRATIONS_DIR): string[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/**
 * Serves every `*.sql` file in db/migrations to kysely's Migrator. The migration
 * name is the filename without `.sql`, and kysely orders by that name, so the
 * numeric prefix defines the order.
 *
 * Forward-only by design: kysely's migrateDown silently does nothing for a
 * migration with no `down` (it leaves the tracking row in place), so we never
 * define one and never expose a rollback command. Undo by writing a new
 * migration.
 */
export class SqlFileMigrationProvider implements MigrationProvider {
  constructor(private readonly dir: string = MIGRATIONS_DIR) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {};

    for (const file of migrationFilenames(this.dir)) {
      const name = file.slice(0, -'.sql'.length);
      if (name.length > 255) {
        throw new Error(
          `migration name is longer than kysely_migration.name (varchar(255)): ${file}`,
        );
      }

      const contents = fs.readFileSync(path.join(this.dir, file), 'utf8');
      migrations[name] = {
        // node-postgres sends parameterless queries over the simple query
        // protocol, so one file may hold many `;`-separated statements.
        up: async (db: Kysely<unknown>) => {
          await sql.raw(contents).execute(db);
        },
      };
    }

    return migrations;
  }
}
