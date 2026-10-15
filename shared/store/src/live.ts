import { sql, type Transaction } from 'kysely'
import type { DB } from '@branch/types'

// Soft-deleted parents still satisfy the FK, so the store raises Postgres's own
// foreign_key_violation to keep callers' 23503 handling unchanged.
export class ForeignKeyViolation extends Error {
  readonly code = '23503'
}

export const now = () => sql<Date>`now()`

// FOR UPDATE conflicts with the soft delete's UPDATE, as the FK's KEY SHARE lock did with the hard delete.
export async function requireLiveProject(trx: Transaction<DB>, projectId: number): Promise<void> {
  const row = await trx
    .selectFrom('branch.projects')
    .where('project_id', '=', projectId)
    .where('deleted_at', 'is', null)
    .select('project_id')
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ForeignKeyViolation(`project ${projectId} does not exist`)
}

export async function requireLiveDonor(trx: Transaction<DB>, donorId: number): Promise<void> {
  const row = await trx
    .selectFrom('branch.donors')
    .where('donor_id', '=', donorId)
    .where('deleted_at', 'is', null)
    .select('donor_id')
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ForeignKeyViolation(`donor ${donorId} does not exist`)
}

export async function requireLiveUsers(trx: Transaction<DB>, userIds: number[]): Promise<void> {
  const wanted = [...new Set(userIds)]
  if (wanted.length === 0) return
  const rows = await trx
    .selectFrom('branch.users')
    .where('user_id', 'in', wanted)
    .where('deleted_at', 'is', null)
    .select('user_id')
    .forUpdate()
    .execute()
  if (rows.length !== wanted.length) throw new ForeignKeyViolation('user does not exist')
}
