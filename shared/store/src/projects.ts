import type { Insertable, Selectable, Transaction, Updateable } from 'kysely'
import type { DB } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump, seedProjectRollup } from './rollups'

type Project = Selectable<DB['branch.projects']>

export type MemberInput = { user_id: number; role?: string | null }

/**
 * Replaces the roster wholesale. An omitted role keeps whatever the member
 * already held, so a caller that only reorders members does not reset roles.
 */
async function syncMemberships(
  trx: Transaction<DB>,
  projectId: number,
  members: MemberInput[],
  defaultRole: string,
): Promise<void> {
  const existing = await trx
    .selectFrom('branch.project_memberships')
    .where('project_id', '=', projectId)
    .select(['user_id', 'role'])
    .execute()
  const heldRole = new Map(existing.map((row) => [row.user_id, row.role]))

  await trx.deleteFrom('branch.project_memberships').where('project_id', '=', projectId).execute()

  if (members.length > 0) {
    await trx
      .insertInto('branch.project_memberships')
      .values(
        members.map((m) => ({
          project_id: projectId,
          user_id: m.user_id,
          role: m.role ?? heldRole.get(m.user_id) ?? defaultRole,
        })),
      )
      .execute()
  }

  const delta = members.length - existing.length
  if (delta !== 0) await projectRollupBump(trx, projectId, { members: delta })
}

export async function createProject(
  values: Insertable<DB['branch.projects']>,
  members: MemberInput[],
  defaultRole: string,
): Promise<Project> {
  return tx(async (trx) => {
    const row = await trx
      .insertInto('branch.projects')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow()
    await seedProjectRollup(trx, row.project_id)
    if (members.length > 0) await syncMemberships(trx, row.project_id, members, defaultRole)
    return row
  })
}

export async function updateProject(
  id: number,
  values: Updateable<DB['branch.projects']>,
  members: MemberInput[] | undefined,
  defaultRole: string,
): Promise<Project | undefined> {
  return tx(async (trx) => {
    const row =
      Object.keys(values).length > 0
        ? await trx
            .updateTable('branch.projects')
            .set(values)
            .where('project_id', '=', id)
            .returningAll()
            .executeTakeFirst()
        : await trx
            .selectFrom('branch.projects')
            .where('project_id', '=', id)
            .selectAll()
            .executeTakeFirst()

    if (!row) return undefined
    if (members !== undefined) await syncMemberships(trx, id, members, defaultRole)
    return row
  })
}

/** Both rollup tables reference projects ON DELETE CASCADE, so they clean themselves up. */
export async function removeProject(id: number): Promise<bigint> {
  return tx(async (trx) => {
    const deleted = await trx
      .deleteFrom('branch.projects')
      .where('project_id', '=', id)
      .executeTakeFirst()
    return deleted?.numDeletedRows ?? 0n
  })
}
