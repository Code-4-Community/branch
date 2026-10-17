import type { Selectable } from 'kysely'
import type { DB, NewDonation, NewDonor } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump } from './rollups'
import { now, requireLiveDonor, requireLiveProject } from './live'

type Donation = Selectable<DB['branch.project_donations']>

// amount is NUMERIC (a string); negate textually so the exact decimal survives.
const negate = (amount: string) => (amount.startsWith('-') ? amount.slice(1) : `-${amount}`)

export async function recordDonation(values: NewDonation): Promise<Donation> {
  return tx(async (trx) => {
    await requireLiveDonor(trx, values.donor_id)
    await requireLiveProject(trx, values.project_id)
    const row = await trx
      .insertInto('branch.project_donations')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow()
    await projectRollupBump(trx, row.project_id, { donated: row.amount, donations: 1 })
    return row
  })
}

export async function removeDonation(id: number): Promise<bigint> {
  return tx(async (trx) => {
    const before = await trx
      .selectFrom('branch.project_donations')
      .where('donation_id', '=', id)
      .where('deleted_at', 'is', null)
      .selectAll()
      .forUpdate()
      .executeTakeFirst()
    if (!before) return 0n

    const deleted = await trx
      .updateTable('branch.project_donations')
      .set({ deleted_at: now() })
      .where('donation_id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    const removed = deleted.numUpdatedRows
    if (removed === 0n) return 0n

    await projectRollupBump(trx, before.project_id, {
      donated: negate(before.amount),
      donations: -1,
    })
    return removed
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
      .returning('donor_id')
      .executeTakeFirst()
    if (!deleted) return 0n

    // RETURNING, not a prior SELECT: a donation added in between would be missed.
    const removed = await trx
      .updateTable('branch.project_donations')
      .set({ deleted_at: now() })
      .where('donor_id', '=', donorId)
      .where('deleted_at', 'is', null)
      .returning(['project_id', 'amount'])
      .execute()

    for (const donation of removed) {
      await projectRollupBump(trx, donation.project_id, {
        donated: negate(donation.amount),
        donations: -1,
      })
    }
    return 1n
  })
}
