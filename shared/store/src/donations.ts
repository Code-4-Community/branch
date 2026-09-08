import type { Selectable } from 'kysely'
import type { DB, NewDonation, NewDonor } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump } from './rollups'

type Donation = Selectable<DB['branch.project_donations']>

// amount is NUMERIC (a string); negate textually so the exact decimal survives.
const negate = (amount: string) => (amount.startsWith('-') ? amount.slice(1) : `-${amount}`)

export async function recordDonation(values: NewDonation): Promise<Donation> {
  return tx(async (trx) => {
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
      .selectAll()
      .forUpdate()
      .executeTakeFirst()
    if (!before) return 0n

    const deleted = await trx
      .deleteFrom('branch.project_donations')
      .where('donation_id', '=', id)
      .executeTakeFirst()
    const removed = deleted?.numDeletedRows ?? 0n
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

// donor_id is ON DELETE RESTRICT: delete the donations first and back their rollup out.
export async function removeDonor(donorId: number): Promise<bigint> {
  return tx(async (trx) => {
    // RETURNING, not a prior SELECT: a donation inserted between the two would
    // be deleted here and never come off the rollup.
    const removed = await trx
      .deleteFrom('branch.project_donations')
      .where('donor_id', '=', donorId)
      .returning(['project_id', 'amount'])
      .execute()

    const deleted = await trx
      .deleteFrom('branch.donors')
      .where('donor_id', '=', donorId)
      .executeTakeFirst()

    for (const donation of removed) {
      await projectRollupBump(trx, donation.project_id, {
        donated: negate(donation.amount),
        donations: -1,
      })
    }
    return deleted?.numDeletedRows ?? 0n
  })
}
