import { sql, type Transaction } from 'kysely'
import type { DB } from '@branch/types'

// Soft-deleted parents still satisfy the FK, so raise 23503 ourselves.
export class ForeignKeyViolation extends Error {
  readonly code = '23503'
}

export const now = () => sql<Date>`now()`

// KEY SHARE: inserts under one parent never conflict; the *_live_key index makes the soft-delete stamp a key update, which does.
export async function requireLiveProject(trx: Transaction<DB>, projectId: number): Promise<void> {
  const row = await trx
    .selectFrom('branch.projects')
    .where('project_id', '=', projectId)
    .where('deleted_at', 'is', null)
    .select('project_id')
    .forKeyShare()
    .executeTakeFirst()
  if (!row) throw new ForeignKeyViolation(`project ${projectId} does not exist`)
}

export async function requireLiveDonor(trx: Transaction<DB>, donorId: number): Promise<void> {
  const row = await trx
    .selectFrom('branch.donors')
    .where('donor_id', '=', donorId)
    .where('deleted_at', 'is', null)
    .select('donor_id')
    .forKeyShare()
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
    .forKeyShare()
    .execute()
  if (rows.length !== wanted.length) throw new ForeignKeyViolation('user does not exist')
}
