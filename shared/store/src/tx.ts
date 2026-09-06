import type { Transaction } from 'kysely'
import type { DB } from '@branch/types'
import { writeDb } from './connection'

// Postgres serialization_failure / deadlock_detected, plus the codes Aurora DSQL
// raises at commit time under optimistic concurrency control.
const RETRYABLE = new Set(['40001', '40P01', 'OC000', 'OC001'])

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && RETRYABLE.has(code)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs `fn` in one transaction, retrying the WHOLE transaction on a commit-time
 * conflict. Retrying only the rollup half would double-count the base write.
 */
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
