import type { Impersonator, ImpersonationMode } from '@branch/types'
import { tx } from './tx'

export interface NewImpersonationSession {
  staffUserId: number
  targetUserId: number
  mode: ImpersonationMode
  // Passed in rather than defaulted by the column, so expiry is compared against
  // one clock: the lambda's.
  startedAt: Date
  expiresAt: Date
}

export async function startImpersonationSession(values: NewImpersonationSession): Promise<string> {
  return tx(async (trx) => {
    const row = await trx
      .insertInto('branch.impersonation_sessions')
      .values({
        staff_user_id: values.staffUserId,
        target_user_id: values.targetUserId,
        mode: values.mode,
        started_at: values.startedAt,
        expires_at: values.expiresAt,
      })
      .returning('session_id')
      .executeTakeFirstOrThrow()
    return row.session_id
  })
}

/** Bound to the staff account, so one cannot end another's session. Idempotent. */
export async function endImpersonationSession(sessionId: string, staffUserId: number): Promise<void> {
  await tx(async (trx) =>
    trx
      .updateTable('branch.impersonation_sessions')
      .set({ ended_at: new Date() })
      .where('session_id', '=', sessionId)
      .where('staff_user_id', '=', staffUserId)
      .where('ended_at', 'is', null)
      .execute(),
  )
}

/** The `onImpersonatedWrite` hook for `dispatch`. */
export async function recordImpersonationAction(
  impersonator: Pick<Impersonator, 'sessionId'>,
  method: string,
  path: string,
  statusCode: number,
): Promise<void> {
  await tx(async (trx) =>
    trx
      .insertInto('branch.impersonation_actions')
      .values({ session_id: impersonator.sessionId, method, path, status_code: statusCode })
      .execute(),
  )
}

/** Only the provisioning script creates these; no route can set is_staff. */
export async function createStaffUser(values: {
  cognitoSub: string
  email: string
  name: string
}): Promise<number> {
  return tx(async (trx) => {
    const row = await trx
      .insertInto('branch.users')
      .values({
        cognito_sub: values.cognitoSub,
        email: values.email,
        name: values.name,
        is_admin: false,
        is_staff: true,
      })
      .returning('user_id')
      .executeTakeFirstOrThrow()
    return row.user_id
  })
}
