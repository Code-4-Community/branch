import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { DB } from '@branch/dtos'


const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER ?? 'branch_dev',
      password: process.env.DB_PASSWORD ?? 'password',
      database: process.env.DB_NAME ?? 'branch_db',
      ssl: false, 
    }),
  }),
})

export default db
