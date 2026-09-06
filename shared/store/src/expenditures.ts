import type { Insertable, Selectable, Updateable } from 'kysely'
import type { DB } from '@branch/types'
import { tx } from './tx'
import { expenditureRollupAdd, expenditureRollupRemove } from './rollups'

type Expenditure = Selectable<DB['branch.expenditures']>

export async function recordExpenditure(
  values: Insertable<DB['branch.expenditures']>,
): Promise<Expenditure> {
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

/**
 * Reads the row before updating it: the rollup grain is keyed on project, month,
 * status and category, so the old values are needed to back the old bucket out.
 * The trigger this replaced got OLD for free.
 */
export async function editExpenditure(
  id: number,
  values: Updateable<DB['branch.expenditures']>,
): Promise<Expenditure | undefined> {
  return tx(async (trx) => {
    const before = await trx
      .selectFrom('branch.expenditures')
      .where('expenditure_id', '=', id)
      .selectAll()
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
      .executeTakeFirst()
    if (!before) return 0n

    const deleted = await trx
      .deleteFrom('branch.expenditures')
      .where('expenditure_id', '=', id)
      .executeTakeFirst()

    await expenditureRollupRemove(trx, before)
    return deleted?.numDeletedRows ?? 0n
  })
}
