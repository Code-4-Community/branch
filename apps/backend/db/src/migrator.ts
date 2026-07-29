import { CompiledQuery, Kysely, Migrator, PostgresDialect } from 'kysely';
import { SCHEMA, createPool } from './config';
import { SqlFileMigrationProvider } from './provider';

export function createDb(): Kysely<unknown> {
  return new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: createPool(),
      // Awaited by PostgresDriver before the connection is handed out, so every
      // migration runs with search_path=branch and may use unqualified table
      // names. Doing this with a `SET` inside a migration file instead would
      // leak the setting onto a pooled connection.
      onCreateConnection: async (connection) => {
        await connection.executeQuery(
          CompiledQuery.raw(`set search_path to ${SCHEMA}, public`),
        );
      },
    }),
  });
}

export function createMigrator(db: Kysely<unknown>): Migrator {
  return new Migrator({
    db,
    provider: new SqlFileMigrationProvider(),

    // Bookkeeping lives beside the tables it tracks: branch.kysely_migration
    // (one row per applied migration) and branch.kysely_migration_lock.
    //
    // Keep the DEFAULT table names. kysely-codegen's introspector skips tables
    // named kysely_migration / kysely_migration_lock in every schema, so they
    // stay out of shared/types/db-types.d.ts for free. Renaming them to
    // something like schema_migrations would leak the interfaces into the
    // shared types package.
    migrationTableSchema: SCHEMA,

    // Two contributors' migrations will sometimes merge out of timestamp order
    // (Alice authors first, Bob merges first). With the default `false` that
    // makes the next production deploy fail with "corrupted migrations",
    // fixable only by renaming the file and hand-editing kysely_migration in
    // RDS. With `true` the late migration is simply applied late. Deletions and
    // renames of already-applied migrations are still rejected either way, which
    // is the guard that actually matters.
    allowUnorderedMigrations: true,

    // Byte-order comparison, matching the .sort() the provider uses to order
    // files. The default is localeCompare, whose handling of `_` can disagree
    // with byte order and raise a spurious ordering error when two migrations
    // share a timestamp.
    nameComparator: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  });
}
