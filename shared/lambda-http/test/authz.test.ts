import { ANONYMOUS, RbacSubject } from '@branch/rbac';
import type { AuthContext } from '@branch/lambda-auth';
import { createAuthResolver, requirePermission } from '../src/authz';
import { parseBody } from '../src/body';

const anon: AuthContext = { isAuthenticated: false };
const context = (userId: number, isAdmin = false): AuthContext => ({
  isAuthenticated: true,
  user: { userId, isAdmin } as AuthContext['user'],
});

const subject = (userId: number, isAdmin = false, projects: number[] = []): RbacSubject => ({
  userId,
  isAdmin,
  memberProjectIds: projects,
  directorProjectIds: [],
});

const body = (res: { body: string }) => JSON.parse(res.body);

describe('requirePermission', () => {
  it('returns undefined when the policy allows', () => {
    expect(requirePermission(subject(1, true), 'reports:view')).toBeUndefined();
  });

  it('403s with the policy reason, so the API and the tooltip agree', () => {
    const res = requirePermission(subject(1), 'reports:view')!;
    expect(res.statusCode).toBe(403);
    expect(body(res).message).toBe('Only administrators can do this');
  });

  it('evaluates record-scoped actions against the resource', () => {
    const author = subject(5, false, [2]);
    expect(
      requirePermission(author, 'expense:update', {
        projectId: 2,
        enteredBy: 5,
        status: 'pending',
      }),
    ).toBeUndefined();

    const frozen = requirePermission(author, 'expense:update', {
      projectId: 2,
      enteredBy: 5,
      status: 'approved',
    })!;
    expect(frozen.statusCode).toBe(403);
    expect(body(frozen).message).toMatch(/Approved expenses/);
  });

  it('denies a null subject', () => {
    expect(requirePermission(null, 'projects:view')!.statusCode).toBe(403);
  });
});

describe('createAuthResolver', () => {
  it('loads a subject for an authenticated caller', async () => {
    const resolve = createAuthResolver(
      async () => context(3, true),
      async () => subject(3, true, [1, 2]),
    );
    const auth = await resolve({});
    expect(auth.context.user?.userId).toBe(3);
    expect(auth.subject.memberProjectIds).toEqual([1, 2]);
  });

  it('does not query memberships for an unauthenticated caller', async () => {
    const loadSubject = jest.fn(async () => subject(0));
    const resolve = createAuthResolver(async () => anon, loadSubject);
    const auth = await resolve({});
    expect(auth.subject).toBe(ANONYMOUS);
    expect(loadSubject).not.toHaveBeenCalled();
  });
});

describe('parseBody', () => {
  it('parses JSON', () => {
    expect(parseBody({ body: '{"a":1}' })).toEqual({ a: 1 });
  });

  it('returns an empty object for an absent body', () => {
    expect(parseBody({})).toEqual({});
  });

  it('returns null for malformed JSON', () => {
    expect(parseBody({ body: '{' })).toBeNull();
  });
});
