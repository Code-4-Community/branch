import { Kysely, SqliteDialect, Generated } from 'kysely';
import Database from 'better-sqlite3';
import * as path from 'path';

// Database interface
interface UserTable {
  id: Generated<number>;
  email: string;
  password: string;
  name: string | null;
  isAdmin: number;
}

interface DatabaseSchema {
  user: UserTable;
}

// Get database connection
let dbInstance: Kysely<DatabaseSchema> | null = null;

export function getDatabase(): Kysely<DatabaseSchema> {
  if (!dbInstance) {
    // In production, this would come from environment variable
    // For local development, we use the db.sqlite in the repo root
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../../db.sqlite');
    
    const dialect = new SqliteDialect({
      database: new Database(dbPath),
    });

    dbInstance = new Kysely<DatabaseSchema>({
      dialect,
    });
  }

  return dbInstance;
}

// Helper to convert SQLite integer to boolean
export function toBoolean(value: number | null | undefined): boolean {
  return value === 1;
}

// Helper to convert boolean to SQLite integer
export function toInteger(value: boolean | undefined): number {
  return value ? 1 : 0;
}
