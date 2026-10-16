import type { Selectable } from 'kysely'
import type { DB, NewReport } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump } from './rollups'

type Report = Selectable<DB['branch.reports']>

export async function recordReport(values: NewReport): Promise<Report> {
  return tx(async (trx) => {
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
      .select('project_id')
      .forUpdate()
      .executeTakeFirst()
    if (!before) return 0n

    const deleted = await trx
      .deleteFrom('branch.reports')
      .where('report_id', '=', id)
      .executeTakeFirst()
    const removed = deleted?.numDeletedRows ?? 0n
    if (removed === 0n) return 0n

    await projectRollupBump(trx, before.project_id, { reports: -1 })
    return removed
  })
}
