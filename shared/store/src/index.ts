import type { Kysely } from 'kysely'
import type { DB } from '@branch/types'
import { writeDb } from './connection'

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

export function closeConnection(): Promise<void> {
  return writeDb.destroy()
}

export { recordExpenditure, editExpenditure, removeExpenditure } from './expenditures'
export { recordDonation, removeDonation, createDonor, removeDonor } from './donations'
export { createProject, updateProject, removeProject } from './projects'
export { recordReport, removeReport } from './reports'
export { createUser, updateUser, claimUser, removeUser } from './users'

export type {
  NewExpenditure,
  ExpenditureEdit,
  NewDonation,
  NewDonor,
  NewReport,
  NewProject,
  ProjectEdit,
  NewUser,
  UserEdit,
  ProjectMemberInput,
} from '@branch/types'
