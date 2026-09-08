import type { Selectable, Transaction } from 'kysely'
import type { DB, NewProject, ProjectEdit, ProjectMemberInput } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump, seedProjectRollup } from './rollups'

type Project = Selectable<DB['branch.projects']>

// An absent `role` keeps the member's current one: the staff picker submits bare ids, and defaulting strips directors.
async function syncMemberships(
  trx: Transaction<DB>,
  projectId: number,
  members: ProjectMemberInput[],
  defaultRole: string,
): Promise<void> {
  const existing = await trx
    .selectFrom('branch.project_memberships')
    .where('project_id', '=', projectId)
    .select(['user_id', 'role'])
    .execute()
  const heldRole = new Map(existing.map((row) => [row.user_id, row.role]))

  const cleared = await trx
    .deleteFrom('branch.project_memberships')
    .where('project_id', '=', projectId)
    .executeTakeFirst()

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

  // Counted from the DELETE, not from `existing`: a concurrent roster edit makes
  // that read stale and member_count drifts permanently.
  const delta = members.length - Number(cleared?.numDeletedRows ?? 0n)
  if (delta !== 0) await projectRollupBump(trx, projectId, { members: delta })
}

export async function createProject(
  values: NewProject,
  members: ProjectMemberInput[],
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
  values: ProjectEdit,
  members: ProjectMemberInput[] | undefined,
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
