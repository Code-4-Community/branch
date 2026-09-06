import { sql, type Selectable, type Transaction } from 'kysely'
import type { DB } from '@branch/types'

/**
 * Replaces the row triggers dropped in 20260906_move_rollups_to_application.
 * The arithmetic still lives in the three LANGUAGE sql functions those triggers
 * called; only the INSERT/UPDATE/DELETE dispatch moved up here.
 */

export type ExpenditureGrain = Pick<
  Selectable<DB['branch.expenditures']>,
  'project_id' | 'spent_on' | 'category' | 'status' | 'amount'
>

export async function expenditureRollupAdd(
  trx: Transaction<DB>,
  row: ExpenditureGrain,
): Promise<void> {
  await sql`select branch.expenditure_rollup_add(
    ${row.project_id}, ${row.spent_on}, ${row.category}, ${row.status}, ${row.amount}
  )`.execute(trx)
}

export async function expenditureRollupRemove(
  trx: Transaction<DB>,
  row: ExpenditureGrain,
): Promise<void> {
  await sql`select branch.expenditure_rollup_remove(
    ${row.project_id}, ${row.spent_on}, ${row.category}, ${row.status}, ${row.amount}
  )`.execute(trx)
}

export type RollupDelta = {
  members?: number
  donated?: number | string
  donations?: number
  reports?: number
}

export async function projectRollupBump(
  trx: Transaction<DB>,
  projectId: number,
  delta: RollupDelta,
): Promise<void> {
  await sql`select branch.project_rollup_bump(
    ${projectId},
    ${delta.members ?? 0},
    ${delta.donated ?? 0},
    ${delta.donations ?? 0},
    ${delta.reports ?? 0}
  )`.execute(trx)
}

/** Was the projects_rollup_seed AFTER INSERT trigger. */
export async function seedProjectRollup(
  trx: Transaction<DB>,
  projectId: number,
): Promise<void> {
  await trx
    .insertInto('branch.project_rollup')
    .values({ project_id: projectId })
    .onConflict((oc) => oc.column('project_id').doNothing())
    .execute()
}
