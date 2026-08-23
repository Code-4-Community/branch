import { projectScopeIds, RbacSubject } from '@branch/rbac';

/**
 * The rows of `branch.expenditures` a caller is allowed to see.
 *
 * `projectIds: null` means unrestricted (admin). Otherwise the caller sees
 * expenses on their own projects plus anything they filed themselves — the
 * author clause matters because someone can be removed from a project and must
 * still be able to find the expense they submitted.
 */
export interface ExpenditureScope {
  projectIds: number[] | null;
  authorId: number | null;
}

export function expenditureScope(subject: RbacSubject): ExpenditureScope {
  return { projectIds: projectScopeIds(subject), authorId: subject.userId };
}

/**
 * Apply the scope in SQL, not in a `.filter()` afterwards: the pagination count
 * has to see the same predicate as the page, or a non-admin gets short pages and
 * a total that counts rows they may not read.
 *
 * Typed structurally over `where` so one function serves both queries.
 */
export function applyExpenditureScope<Q extends { where(cb: any): Q }>(
  query: Q,
  scope: ExpenditureScope,
): Q {
  if (!scope.projectIds) return query;
  const projectIds = scope.projectIds;
  const authorId = scope.authorId;
  return query.where((eb: any) =>
    eb.or([
      eb('project_id', 'in', projectIds),
      ...(authorId !== null ? [eb('entered_by', '=', authorId)] : []),
    ]),
  );
}
