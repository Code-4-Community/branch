import type { Kysely } from 'kysely'
import type { DB } from '@branch/types'
import { writeDb } from './connection'

/**
 * Every mutating entry point is stripped, so a controller physically cannot
 * write without going through an operation below. That is what keeps the rollup
 * tables correct now that the row triggers are gone.
 */
export type ReadOnlyDb = Omit<
  Kysely<DB>,
  | 'insertInto'
  | 'updateTable'
  | 'deleteFrom'
  | 'replaceInto'
  | 'transaction'
  | 'withSchema'
  | 'with'
  | 'withRecursive'
  | 'schema'
  | 'destroy'
>

export const db: ReadOnlyDb = writeDb

export { recordExpenditure, editExpenditure, removeExpenditure } from './expenditures'
export { recordDonation, removeDonation, createDonor, removeDonor } from './donations'
export { createProject, updateProject, removeProject, type MemberInput } from './projects'
export { recordReport, removeReport } from './reports'
export { createUser, updateUser, removeUser } from './users'
