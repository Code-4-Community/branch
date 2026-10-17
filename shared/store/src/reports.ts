import type { Selectable } from 'kysely'
import type { DB, NewReport } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump } from './rollups'
import { now, requireLiveProject } from './live'

type Report = Selectable<DB['branch.reports']>

export async function recordReport(values: NewReport): Promise<Report> {
  return tx(async (trx) => {
    await requireLiveProject(trx, values.project_id)
    const row = await trx
      .insertInto('branch.reports')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow()
    await projectRollupBump(trx, row.project_id, { reports: 1 })
    return row
  })
}

export async function removeReport(id: number): Promise<bigint> {
  return tx(async (trx) => {
    const before = await trx
      .selectFrom('branch.reports')
      .where('report_id', '=', id)
      .where('deleted_at', 'is', null)
      .select('project_id')
      .forUpdate()
      .executeTakeFirst()
    if (!before) return 0n

    const deleted = await trx
      .updateTable('branch.reports')
      .set({ deleted_at: now() })
      .where('report_id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    const removed = deleted.numUpdatedRows
    if (removed === 0n) return 0n

    await projectRollupBump(trx, before.project_id, { reports: -1 })
    return removed
  })
}
