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
  const wanted = new Map(members.map((m) => [m.user_id, m.role]))

  // Diffed rather than replaced, so kept members keep their hours and start_date.
  const removed = existing.map((row) => row.user_id).filter((id) => !wanted.has(id))
  const cleared =
    removed.length > 0
      ? await trx
          .deleteFrom('branch.project_memberships')
          .where('project_id', '=', projectId)
          .where('user_id', 'in', removed)
          .executeTakeFirst()
      : undefined

  const roleChanges = new Map<string, number[]>()
  for (const [userId, role] of wanted) {
    const held = heldRole.get(userId)
    if (held === undefined || role == null || role === held) continue
    roleChanges.set(role, [...(roleChanges.get(role) ?? []), userId])
  }
  for (const [role, userIds] of roleChanges) {
    await trx
      .updateTable('branch.project_memberships')
      .set({ role })
      .where('project_id', '=', projectId)
      .where('user_id', 'in', userIds)
      .execute()
  }

  const added = [...wanted].filter(([userId]) => !heldRole.has(userId))
  const inserted =
    added.length > 0
      ? await trx
          .insertInto('branch.project_memberships')
          .values(
            added.map(([userId, role]) => ({
              project_id: projectId,
              user_id: userId,
              role: role ?? defaultRole,
            })),
          )
          .onConflict((oc) => oc.columns(['project_id', 'user_id']).doNothing())
          .returning('membership_id')
          .execute()
      : []

  // Counted from what the statements touched: a concurrent roster edit makes `existing` stale.
  const delta = inserted.length - Number(cleared?.numDeletedRows ?? 0n)
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
