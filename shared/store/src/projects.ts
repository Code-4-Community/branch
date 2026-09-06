import type { Selectable, Transaction } from 'kysely'
import type { DB, NewProject, ProjectEdit, ProjectMemberInput } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump, seedProjectRollup } from './rollups'

type Project = Selectable<DB['branch.projects']>

/**
 * Replaces a project's roster wholesale. Delete-then-insert rather than a diff:
 * the set is small and bounded by the staff list.
 *
 * An entry with no `role` keeps the role that member already held. The staff
 * picker submits bare ids, and "Director" is derived from these rows, so
 * defaulting them all to the fallback would make every ordinary project edit
 * strip the project's directors of their role.
 */
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
