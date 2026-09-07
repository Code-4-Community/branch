import type { Transaction } from 'kysely'
import type { DB } from '@branch/types'
import { writeDb } from './connection'

// Postgres serialization_failure/deadlock, plus Aurora DSQL's commit-time OCC codes.
const RETRYABLE = new Set(['40001', '40P01', 'OC000', 'OC001'])

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && RETRYABLE.has(code)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function tx<T>(
  fn: (trx: Transaction<DB>) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await writeDb.transaction().execute(fn)
    } catch (err) {
      if (attempt >= attempts - 1 || !isRetryable(err)) throw err
      await sleep(2 ** attempt * 25 + Math.random() * 25)
    }
  }
}
