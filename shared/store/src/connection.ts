import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { DB } from '@branch/types'

/**
 * The one Kysely instance in the backend. Not exported from the package root:
 * callers get the read-only `db` handle, or a named write operation.
 */
export const writeDb = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER ?? 'branch_dev',
      password: process.env.DB_PASSWORD ?? 'password',
      database: process.env.DB_NAME ?? 'branch_db',

      // rds.force_ssl = 1 rejects unencrypted connections. Local postgres has no TLS.
      // TODO: pin the RDS CA bundle instead of skipping verification.
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,

      // A blackholed SYN otherwise hangs until the 30s lambda timeout instead of erroring.
      connectionTimeoutMillis: 5000,

      // A lambda container serves one request at a time; pg's default of 10 just
      // multiplies idle sockets against db.t3.micro's ~112 max_connections.
      max: 1,

      // Lambda freezes the container between invocations, so the idle timer fires late
      // and the pool can hand back a socket the server already dropped.
      idleTimeoutMillis: 0,
      keepAlive: true,

      // Bound a runaway query well under the 30s lambda timeout.
      statement_timeout: 10000,
    }),
  }),
})
