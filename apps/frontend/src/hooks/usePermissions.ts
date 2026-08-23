'use client';

import { useMemo } from 'react';
import {
  ANONYMOUS,
  authorizeAny,
  type Action,
  type RbacSubject,
  type ResourceArgs,
} from '@branch/rbac';
import { useAuth } from '@/context/AuthContext';

export interface Permissions {
  /** The policy subject for the current session; `ANONYMOUS` when signed out. */
  subject: RbacSubject;
  /** True when the action is allowed. Use it to decide whether to render. */
  can: <A extends Action>(action: A, ...resource: ResourceArgs<A>) => boolean;
  /**
   * The tooltip for a control the user may see but not use, or `undefined` when
   * they may. Comes from the policy, so it is word-for-word what the API would
   * have replied.
   */
  why: <A extends Action>(action: A, ...resource: ResourceArgs<A>) => string | undefined;
}

/**
 * The single way the UI asks "may they?".
 *
 * It evaluates `@branch/rbac` — the same module the lambdas run — against the
 * subject `GET /auth/me` returned, so a greyed-out button and the 403 behind it
 * can never disagree. Never re-derive a rule from `isAdmin` in a component:
 * that is how the two copies drift.
 */
export function usePermissions(): Permissions {
  const { subject } = useAuth();

  return useMemo(
    () => ({
      subject: subject ?? ANONYMOUS,
      can: <A extends Action>(action: A, ...resource: ResourceArgs<A>) =>
        authorizeAny(subject, action, (resource as unknown[])[0]).allowed,
      why: <A extends Action>(action: A, ...resource: ResourceArgs<A>) => {
        const decision = authorizeAny(subject, action, (resource as unknown[])[0]);
        return decision.allowed ? undefined : decision.reason;
      },
    }),
    [subject],
  );
}
