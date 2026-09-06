import type { Insertable, Selectable, Updateable } from 'kysely'
import type { DB } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump } from './rollups'

type User = Selectable<DB['branch.users']>

export async function createUser(values: Insertable<DB['branch.users']>): Promise<User> {
  return tx(async (trx) =>
    trx.insertInto('branch.users').values(values).returningAll().executeTakeFirstOrThrow(),
  )
}

export async function updateUser(
  id: number,
  values: Updateable<DB['branch.users']>,
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

/**
 * user_id on project_memberships is ON DELETE RESTRICT, so the memberships have
 * to go first and member_count has to come off each project explicitly. Under
 * the old CASCADE the row trigger did this; the users lambda never knew the
 * rollups existed.
 */
export async function removeUser(userId: number): Promise<bigint> {
  return tx(async (trx) => {
    const memberships = await trx
      .selectFrom('branch.project_memberships')
      .where('user_id', '=', userId)
      .select('project_id')
      .execute()

    if (memberships.length > 0) {
      await trx.deleteFrom('branch.project_memberships').where('user_id', '=', userId).execute()
    }

    const deleted = await trx
      .deleteFrom('branch.users')
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if ((deleted?.numDeletedRows ?? 0n) === 0n) return 0n

    for (const membership of memberships) {
      await projectRollupBump(trx, membership.project_id, { members: -1 })
    }
    return deleted?.numDeletedRows ?? 0n
  })
}
