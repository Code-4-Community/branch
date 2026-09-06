import type { Selectable } from 'kysely'
import type { DB, NewDonation, NewDonor } from '@branch/types'
import { tx } from './tx'
import { projectRollupBump } from './rollups'

type Donation = Selectable<DB['branch.project_donations']>

// amount is NUMERIC, surfaced as a string. Negate textually so the exact decimal
// survives; Number() would round at the edges of the type.
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
      .executeTakeFirst()
    if (!before) return 0n

    const deleted = await trx
      .deleteFrom('branch.project_donations')
      .where('donation_id', '=', id)
      .executeTakeFirst()

    await projectRollupBump(trx, before.project_id, {
      donated: negate(before.amount),
      donations: -1,
    })
    return deleted?.numDeletedRows ?? 0n
  })
}

export async function createDonor(
  values: NewDonor,
): Promise<Selectable<DB['branch.donors']>> {
  return tx(async (trx) =>
    trx.insertInto('branch.donors').values(values).returningAll().executeTakeFirstOrThrow(),
  )
}

/**
 * donor_id is ON DELETE RESTRICT, so the donations have to go first and their
 * rollup contribution has to come off explicitly. Under the old CASCADE the row
 * trigger did this; nothing in the donors lambda knew the rollups existed.
 */
export async function removeDonor(donorId: number): Promise<bigint> {
  return tx(async (trx) => {
    const donations = await trx
      .selectFrom('branch.project_donations')
      .where('donor_id', '=', donorId)
      .select(['project_id', 'amount'])
      .execute()

    if (donations.length > 0) {
      await trx.deleteFrom('branch.project_donations').where('donor_id', '=', donorId).execute()
    }

    const deleted = await trx
      .deleteFrom('branch.donors')
      .where('donor_id', '=', donorId)
      .executeTakeFirst()

    if ((deleted?.numDeletedRows ?? 0n) === 0n) return 0n

    for (const donation of donations) {
      await projectRollupBump(trx, donation.project_id, {
        donated: negate(donation.amount),
        donations: -1,
      })
    }
    return deleted?.numDeletedRows ?? 0n
  })
}
