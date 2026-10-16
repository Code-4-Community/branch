import type { Selectable } from 'kysely'
import type { DB, NewUser, UserEdit } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump } from './rollups'

type User = Selectable<DB['branch.users']>

export async function createUser(values: NewUser): Promise<User> {
  return tx(async (trx) =>
    trx.insertInto('branch.users').values(values).returningAll().executeTakeFirstOrThrow(),
  )
}

export async function updateUser(
  id: number,
  values: UserEdit,
): Promise<User | undefined> {
  return tx(async (trx) =>
    trx
      .updateTable('branch.users')
      .set(values)
      .where('user_id', '=', id)
      .returningAll()
      .executeTakeFirst(),
  )
}

// The `cognito_sub IS NULL` guard makes a concurrent claim a no-op instead of overwriting a live account.
export async function claimUser(userId: number, values: UserEdit): Promise<bigint> {
  return tx(async (trx) => {
    const result = await trx
      .updateTable('branch.users')
      .set(values)
      .where('user_id', '=', userId)
      .where('cognito_sub', 'is', null)
      .executeTakeFirst()
    return result.numUpdatedRows
  })
}

// user_id on project_memberships is ON DELETE RESTRICT: delete memberships first and decrement member_count.
export async function removeUser(userId: number): Promise<bigint> {
  return tx(async (trx) => {
    // RETURNING, not a prior SELECT: a membership added in between would be missed.
    const removed = await trx
      .deleteFrom('branch.project_memberships')
      .where('user_id', '=', userId)
      .returning('project_id')
      .execute()

    const deleted = await trx
      .deleteFrom('branch.users')
      .where('user_id', '=', userId)
      .executeTakeFirst()

    for (const membership of removed) {
      await projectRollupBump(trx, membership.project_id, { members: -1 })
    }
    return deleted?.numDeletedRows ?? 0n
  })
}
