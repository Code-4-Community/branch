import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { DB } from '@branch/types'
import { kyselyTelemetryLog } from '@branch/lambda-telemetry'

const db = new Kysely<DB>({
  log: kyselyTelemetryLog,
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER ?? 'branch_dev',
      password: process.env.DB_PASSWORD ?? 'password',
      database: process.env.DB_NAME ?? 'branch_db',

      // rds.force_ssl = 1 on default.postgres17 rejects unencrypted connections,
      // so ssl: false never worked against prod. Local postgres has no TLS.
      // TODO: pin the RDS CA bundle instead of skipping verification.
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,

      // Without this a blackholed SYN hangs until the 30s lambda timeout instead
      // of erroring, which is how the unreachable-database bug presented.
      connectionTimeoutMillis: 5000,

      // A lambda container serves one request at a time, so pg's default of 10
      // just multiplies idle sockets against db.t3.micro's ~112 max_connections.
      max: 1,

      // Lambda freezes the container between invocations, so the idle timer fires
      // late and the pool can hand back a socket the server already dropped.
      idleTimeoutMillis: 0,
      keepAlive: true,

      // Bound a runaway query well under the 30s lambda timeout.
      statement_timeout: 10000,
    }),
  }),
})

export default db
