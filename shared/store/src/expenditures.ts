import type { Selectable } from 'kysely'
import type { DB, ExpenditureEdit, NewExpenditure } from '@branch/types'
import { tx } from './tx'
import { expenditureRollupAdd, expenditureRollupRemove } from './rollups'
import { now, requireLiveProject } from './live'

type Expenditure = Selectable<DB['branch.expenditures']>

export async function recordExpenditure(values: NewExpenditure): Promise<Expenditure> {
  return tx(async (trx) => {
    await requireLiveProject(trx, values.project_id)
    const row = await trx
      .insertInto('branch.expenditures')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow()
    await expenditureRollupAdd(trx, row)
    return row
  })
}

/** The locked row's status no longer matches the one the caller authorized against. */
export class ExpenditureStatusChangedError extends Error {
  constructor(readonly status: string) {
    super(`Expenditure status changed to ${status}`)
  }
}

export async function editExpenditure(
  id: number,
  values: ExpenditureEdit,
  expectedStatus?: string,
): Promise<Expenditure | undefined> {
  return tx(async (trx) => {
    const before = await trx
      .selectFrom('branch.expenditures')
      .where('expenditure_id', '=', id)
      .where('deleted_at', 'is', null)
      .selectAll()
      .forUpdate()
      .executeTakeFirst()
    if (!before) return undefined
    if (expectedStatus !== undefined && before.status !== expectedStatus) {
      throw new ExpenditureStatusChangedError(before.status)
    }

    const after = await trx
      .updateTable('branch.expenditures')
      .set(values)
      .where('expenditure_id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()

    await expenditureRollupRemove(trx, before)
    await expenditureRollupAdd(trx, after)
    return after
  })
}

export async function removeExpenditure(id: number, expectedStatus?: string): Promise<bigint> {
  return tx(async (trx) => {
    const before = await trx
      .selectFrom('branch.expenditures')
      .where('expenditure_id', '=', id)
      .where('deleted_at', 'is', null)
      .selectAll()
      .forUpdate()
      .executeTakeFirst()
    if (!before) return 0n
    if (expectedStatus !== undefined && before.status !== expectedStatus) {
      throw new ExpenditureStatusChangedError(before.status)
    }

    const deleted = await trx
      .updateTable('branch.expenditures')
      .set({ deleted_at: now() })
      .where('expenditure_id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    const removed = deleted.numUpdatedRows
    if (removed === 0n) return 0n

    await expenditureRollupRemove(trx, before)
    return removed
  })
}
