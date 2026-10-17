import type { Selectable } from 'kysely'
import type { DB, NewDonation, NewDonor } from '@branch/types'
import { tx } from './tx'
import { now, requireLiveDonor, requireLiveProject } from './live'

type Donation = Selectable<DB['branch.project_donations']>

export async function recordDonation(values: NewDonation): Promise<Donation> {
  return tx(async (trx) => {
    await requireLiveDonor(trx, values.donor_id)
    await requireLiveProject(trx, values.project_id)
    return trx.insertInto('branch.project_donations').values(values).returningAll().executeTakeFirstOrThrow()
  })
}

export async function removeDonation(id: number): Promise<bigint> {
  return tx(async (trx) => {
    const deleted = await trx
      .updateTable('branch.project_donations')
      .set({ deleted_at: now() })
      .where('donation_id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    return deleted.numUpdatedRows
  })
}

export async function createDonor(
  values: NewDonor,
): Promise<Selectable<DB['branch.donors']>> {
  return tx(async (trx) =>
    trx.insertInto('branch.donors').values(values).returningAll().executeTakeFirstOrThrow(),
  )
}

export async function removeDonor(donorId: number): Promise<bigint> {
  return tx(async (trx) => {
    const deleted = await trx
      .updateTable('branch.donors')
      .set({ deleted_at: now() })
      .where('donor_id', '=', donorId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (deleted.numUpdatedRows === 0n) return 0n

    await trx
      .updateTable('branch.project_donations')
      .set({ deleted_at: now() })
      .where('donor_id', '=', donorId)
      .where('deleted_at', 'is', null)
      .execute()
    return deleted.numUpdatedRows
  })
}
