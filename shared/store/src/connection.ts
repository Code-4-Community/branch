import { Kysely, PostgresDialect } from 'kysely'
import { Pool, type PoolConfig } from 'pg'
import type { DB } from '@branch/types'
import { dsqlAuthToken, dsqlRegion } from './dsql'

const host = process.env.DB_HOST ?? 'localhost'

const shared: PoolConfig = {
  host,
  port: Number(process.env.DB_PORT ?? 5432),

  // A blackholed SYN otherwise hangs until the 30s lambda timeout instead of erroring.
  connectionTimeoutMillis: 5000,

  // A lambda container serves one request at a time; pg's default of 10 just
  // multiplies idle sockets.
  max: 1,

  // Lambda freezes the container between invocations, so the idle timer fires late
  // and the pool can hand back a socket the server already dropped.
  idleTimeoutMillis: 0,
  keepAlive: true,
}

function dsqlConfig(): PoolConfig {
  const user = process.env.DB_USER ?? 'admin'
  return {
    ...shared,
    user,
    database: process.env.DB_NAME ?? 'postgres',
    // Minted per connection: the token is only checked at connect time.
    password: () => dsqlAuthToken(host, user),
    ssl: { rejectUnauthorized: true },
    // DSQL closes every connection after an hour; retire ours first.
    maxLifetimeSeconds: 3000,
  }
}

function postgresConfig(): PoolConfig {
  return {
    ...shared,
    user: process.env.DB_USER ?? 'branch_dev',
    password: process.env.DB_PASSWORD ?? 'password',
    database: process.env.DB_NAME ?? 'branch_db',

    // rds.force_ssl = 1 rejects unencrypted connections. Local postgres has no TLS.
    // TODO: pin the RDS CA bundle instead of skipping verification.
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,

    // Bound a runaway query well under the 30s lambda timeout.
    statement_timeout: 10000,
  }
}

export const writeDb = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool(dsqlRegion(host) ? dsqlConfig() : postgresConfig()),
  }),
})
