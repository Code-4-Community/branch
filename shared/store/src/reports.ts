import type { Selectable } from 'kysely'
import type { DB, NewReport } from '@branch/types'
import { tx } from './tx'
import { now, requireLiveProject } from './live'

type Report = Selectable<DB['branch.reports']>

export async function recordReport(values: NewReport): Promise<Report> {
  return tx(async (trx) => {
    await requireLiveProject(trx, values.project_id)
    return trx.insertInto('branch.reports').values(values).returningAll().executeTakeFirstOrThrow()
  })
}

export async function removeReport(id: number): Promise<bigint> {
  return tx(async (trx) => {
    const deleted = await trx
      .updateTable('branch.reports')
      .set({ deleted_at: now() })
      .where('report_id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    return deleted.numUpdatedRows
  })
}
