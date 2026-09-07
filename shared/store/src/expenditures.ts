import type { Selectable } from 'kysely'
import type { DB, ExpenditureEdit, NewExpenditure } from '@branch/types'
import { tx } from './tx'
import { expenditureRollupAdd, expenditureRollupRemove } from './rollups'

type Expenditure = Selectable<DB['branch.expenditures']>

export async function recordExpenditure(values: NewExpenditure): Promise<Expenditure> {
  return tx(async (trx) => {
    const row = await trx
      .insertInto('branch.expenditures')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow()
    await expenditureRollupAdd(trx, row)
    return row
  })
}

export async function editExpenditure(
  id: number,
  values: ExpenditureEdit,
): Promise<Expenditure | undefined> {
  return tx(async (trx) => {
    const before = await trx
      .selectFrom('branch.expenditures')
      .where('expenditure_id', '=', id)
      .selectAll()
      .forUpdate()
      .executeTakeFirst()
    if (!before) return undefined

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

export async function removeExpenditure(id: number): Promise<bigint> {
  return tx(async (trx) => {
    const before = await trx
      .selectFrom('branch.expenditures')
      .where('expenditure_id', '=', id)
      .selectAll()
      .forUpdate()
      .executeTakeFirst()
    if (!before) return 0n

    const deleted = await trx
      .deleteFrom('branch.expenditures')
      .where('expenditure_id', '=', id)
      .executeTakeFirst()
    const removed = deleted?.numDeletedRows ?? 0n
    // A concurrent delete already took the row; decrementing again drifts.
    if (removed === 0n) return 0n

    await expenditureRollupRemove(trx, before)
    return removed
  })
}
