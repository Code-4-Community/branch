'use client';

import React from 'react';
import { authorizeAny, type Action, type ResourceOf } from '@branch/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import Button from './Button';
import Tooltip from './Tooltip';

/**
 * The two ways this app expresses a permission in the UI, and the only two.
 *
 *   `<Can>`         — hide what they may not see.
 *   `<GatedButton>` — grey out what they may not do, with the reason on hover.
 *
 * Both read `@branch/rbac` through `usePermissions`, so neither can drift from
 * the backend. Do not gate on `isAdmin` in a component: the policy already
 * knows the answer and the API is enforcing that same answer.
 */

type ResourceProp<A extends Action> = ResourceOf<A> extends void
  ? { resource?: undefined }
  : { resource: ResourceOf<A> };

/** Renders `children` only when the action is allowed. */
export function Can<A extends Action>({
  action,
  resource,
  children,
  fallback = null,
}: {
  action: A;
  children: React.ReactNode;
  fallback?: React.ReactNode;
} & ResourceProp<A>) {
  const { subject } = usePermissions();
  return <>{authorizeAny(subject, action, resource).allowed ? children : fallback}</>;
}

/**
 * A `Button` that disables itself when the policy says no and explains why.
 *
 * Disabled rather than hidden on purpose: for an action the user can see the
 * subject of — an expense in front of them, a project they are on — hiding the
 * control reads as a bug, while "Approved expenses can only be edited by an
 * administrator" tells them what happened.
 */
export function GatedButton<A extends Action>({
  action,
  resource,
  disabled,
  children,
  ...rest
}: {
  action: A;
} & ResourceProp<A> &
  React.ComponentProps<typeof Button>) {
  const { subject } = usePermissions();
  const decision = authorizeAny(subject, action, resource);
  const reason = decision.allowed ? undefined : decision.reason;

  return (
    <Tooltip label={reason} wrapsDisabledControl={reason !== undefined}>
      <Button {...rest} disabled={disabled || reason !== undefined}>
        {children}
      </Button>
    </Tooltip>
  );
}
