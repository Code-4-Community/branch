import type { Selectable, Transaction } from 'kysely'
import type { DB, NewProject, ProjectEdit, ProjectMemberInput } from '@branch/types'
import { tx } from './tx'
import { now, requireLiveUsers } from './live'

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
  await requireLiveUsers(trx, members.map((m) => m.user_id))
  const wanted = new Map(members.map((m) => [m.user_id, m.role]))

  // Diffed rather than replaced, so kept members keep their hours and start_date.
  const removed = existing.map((row) => row.user_id).filter((id) => !wanted.has(id))
  if (removed.length > 0) {
    await trx
      .deleteFrom('branch.project_memberships')
      .where('project_id', '=', projectId)
      .where('user_id', 'in', removed)
      .execute()
  }

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
  if (added.length > 0) {
    await trx
      .insertInto('branch.project_memberships')
      .values(
        added.map(([userId, role]) => ({
          project_id: projectId,
          user_id: userId,
          role: role ?? defaultRole,
        })),
      )
      .onConflict((oc) => oc.columns(['project_id', 'user_id']).doNothing())
      .execute()
  }
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
    // Lambdas still on the rollup code fail a write to a project with no row; drop with the tables.
    await trx.insertInto('branch.project_rollup').values({ project_id: row.project_id }).execute()
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
            .where('deleted_at', 'is', null)
            .returningAll()
            .executeTakeFirst()
        : await trx
            .selectFrom('branch.projects')
            .where('project_id', '=', id)
            .where('deleted_at', 'is', null)
            .selectAll()
            .forKeyShare()
            .executeTakeFirst()

    if (!row) return undefined
    if (members !== undefined) await syncMemberships(trx, id, members, defaultRole)
    return row
  })
}

export async function removeProject(id: number): Promise<bigint> {
  return tx(async (trx) => {
    const deleted = await trx
      .updateTable('branch.projects')
      .set({ deleted_at: now() })
      .where('project_id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (deleted.numUpdatedRows === 0n) return 0n

    for (const table of ['branch.project_donations', 'branch.expenditures', 'branch.reports'] as const) {
      await trx
        .updateTable(table)
        .set({ deleted_at: now() })
        .where('project_id', '=', id)
        .where('deleted_at', 'is', null)
        .execute()
    }
    await trx.deleteFrom('branch.project_memberships').where('project_id', '=', id).execute()
    return deleted.numUpdatedRows
  })
}
