/**
 * Covers the endpoints the project page depends on: the enriched list, the
 * single-call overview, the staff roster, and membership sync on write.
 */
import { test, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

jest.mock('../auth', () => {
  // dispatch() resolves the caller through resolveAuth, so an auto-mock would
  // hand it `undefined` and every route would 500. Only the authenticate half
  // is faked: the subject is still loaded from the seeded memberships, which is
  // what makes "director" and "member of this project" mean anything here.
  const { createAuthResolver } = jest.requireActual<typeof import('@branch/lambda-http')>(
    '@branch/lambda-http',
  );
  const { loadRbacSubject } = jest.requireActual<typeof import('@branch/lambda-auth')>(
    '@branch/lambda-auth',
  );
  const db = jest.requireActual<typeof import('../db')>('../db').default;
  const authenticateRequest = jest.fn();
  return {
    ...jest.requireActual<typeof import('../auth')>('../auth'),
    authenticateRequest,
    resolveAuth: createAuthResolver(
      authenticateRequest as never,
      (context) => loadRbacSubject(db as never, context),
    ),
  };
});

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<
  typeof authenticateRequest
>;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

const adminUser = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

function event(
  rawPath: string,
  method: string,
  body?: unknown,
): Parameters<typeof handler>[0] {
  return {
    rawPath,
    requestContext: { http: { method } },
    headers: { Authorization: 'Bearer fake-token' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  } as never;
}

function parse(res: { body: string }) {
  return JSON.parse(res.body);
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
  } finally {
    client.release();
  }
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue(adminUser);

  const client = await pool.connect();
  try {
    await resetData(client);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
  await db.destroy();
});

// ── Routing ──────────────────────────────────────────────────────────────────

test('/projects/assignable-staff is not parsed as a project id', async () => {
  const res = await handler(event('/assignable-staff', 'GET'));
  expect(res.statusCode).toBe(200);
  const { staff } = parse(res);
  expect(Array.isArray(staff)).toBe(true);
  expect(staff.length).toBeGreaterThan(0);
  // Only the fields the picker renders — not the whole user row.
  expect(Object.keys(staff[0]).sort()).toEqual(['email', 'name', 'profile_image', 'user_id']);
});

test('/projects/dashboard is not parsed as a project id', async () => {
  const res = await handler(event('/dashboard', 'GET'));
  expect(res.statusCode).toBe(200);
  // The dashboard controller's shape, not a single project's — misrouting to
  // `GET /projects/{id}` with id="dashboard" would 400 instead.
  expect(parse(res).summary).toBeDefined();
});

test('400 rather than 403 for a non-numeric project id', async () => {
  const res = await handler(event('/not-a-number', 'GET'));
  expect(res.statusCode).toBe(400);
});

// ── GET /projects ────────────────────────────────────────────────────────────

test('list includes spend, member count and the active flag', async () => {
  await handler(
    event('/', 'POST', {
      name: 'Aggregated',
      total_budget: 1000,
      start_date: '2020-01-01',
      end_date: '2020-06-01',
      members: [1, 2],
    }),
  );

  const res = await handler(event('/', 'GET'));
  expect(res.statusCode).toBe(200);
  const created = parse(res).find((p: { name: string }) => p.name === 'Aggregated');

  expect(created.member_count).toBe(2);
  expect(created.total_spent).toBe(0);
  // End date is in the past, so the list page files it under Archived.
  expect(created.is_active).toBe(false);
});

test('a project with no end date is always active', async () => {
  await handler(event('/', 'POST', { name: 'Ongoing', total_budget: 10, members: [1] }));
  const res = await handler(event('/', 'GET'));
  const created = parse(res).find((p: { name: string }) => p.name === 'Ongoing');
  expect(created.is_active).toBe(true);
});

// ── GET /projects/{id}/overview ──────────────────────────────────────────────

test('overview returns the project, stats, members and expenditures together', async () => {
  const created = parse(
    await handler(
      event('/', 'POST', { name: 'Overview', total_budget: 1000, members: [1, 2] }),
    ),
  );

  const res = await handler(event(`/${created.project_id}/overview`, 'GET'));
  expect(res.statusCode).toBe(200);

  const body = parse(res);
  expect(body.project.name).toBe('Overview');
  expect(body.members).toHaveLength(2);
  expect(body.stats.totalBudget).toBe(1000);
  expect(body.stats.totalSpent).toBe(0);
  expect(body.stats.totalRemaining).toBe(1000);
  // No `canEdit`: the client asks the shared policy rather than trusting a flag
  // the payload computed for it.
  expect(body.canEdit).toBeUndefined();
  expect(body.isActive).toBe(true);
});

test('overview reports 0% rather than NaN when no budget is set', async () => {
  const created = parse(await handler(event('/', 'POST', { name: 'No budget', members: [1] })));
  const body = parse(await handler(event(`/${created.project_id}/overview`, 'GET')));
  expect(body.stats.spentPercentage).toBe(0);
});

test('overview 404s for a project that does not exist', async () => {
  const res = await handler(event('/99999/overview', 'GET'));
  expect(res.statusCode).toBe(404);
});

// ── Membership sync ──────────────────────────────────────────────────────────

test('POST assigns the given staff', async () => {
  const created = parse(
    await handler(event('/', 'POST', { name: 'Staffed', total_budget: 5, members: [1, 3] })),
  );
  const body = parse(await handler(event(`/${created.project_id}/overview`, 'GET')));
  expect(body.members.map((m: { user_id: number }) => m.user_id).sort()).toEqual([1, 3]);
});

test('PUT replaces the roster rather than appending to it', async () => {
  const created = parse(
    await handler(event('/', 'POST', { name: 'Rotating', total_budget: 5, members: [1, 2] })),
  );

  const res = await handler(event(`/${created.project_id}`, 'PUT', { members: [3] }));
  expect(res.statusCode).toBe(200);

  const body = parse(await handler(event(`/${created.project_id}/overview`, 'GET')));
  expect(body.members.map((m: { user_id: number }) => m.user_id)).toEqual([3]);
});

test('PUT without a members key leaves the roster alone', async () => {
  const created = parse(
    await handler(event('/', 'POST', { name: 'Untouched', total_budget: 5, members: [1, 2] })),
  );

  await handler(event(`/${created.project_id}`, 'PUT', { name: 'Renamed' }));

  const body = parse(await handler(event(`/${created.project_id}/overview`, 'GET')));
  expect(body.project.name).toBe('Renamed');
  expect(body.members).toHaveLength(2);
});

test('PUT with an empty members array clears the roster', async () => {
  const created = parse(
    await handler(event('/', 'POST', { name: 'Emptied', total_budget: 5, members: [1] })),
  );
  await handler(event(`/${created.project_id}`, 'PUT', { members: [] }));
  const body = parse(await handler(event(`/${created.project_id}/overview`, 'GET')));
  expect(body.members).toHaveLength(0);
});

test('400 for a member id that is not a real user', async () => {
  const res = await handler(
    event('/', 'POST', { name: 'Ghost staff', total_budget: 5, members: [99999] }),
  );
  expect(res.statusCode).toBe(400);
  expect(parse(res).message).toMatch(/unknown user ids/i);
});

test('400 for a member entry that is not a positive integer id', async () => {
  const res = await handler(
    event('/', 'POST', { name: 'Bad staff', total_budget: 5, members: ['abc'] }),
  );
  expect(res.statusCode).toBe(400);
});

test('a duplicated member id is de-duplicated instead of failing the write', async () => {
  const created = parse(
    await handler(event('/', 'POST', { name: 'Deduped', total_budget: 5, members: [1, 1] })),
  );
  const body = parse(await handler(event(`/${created.project_id}/overview`, 'GET')));
  expect(body.members).toHaveLength(1);
});

// ── Date range ───────────────────────────────────────────────────────────────

test('400 when the end date precedes the start date on create', async () => {
  const res = await handler(
    event('/', 'POST', {
      name: 'Backwards',
      total_budget: 5,
      start_date: '2026-05-01',
      end_date: '2026-01-01',
      members: [1],
    }),
  );
  expect(res.statusCode).toBe(400);
  expect(parse(res).message).toMatch(/end_date/);
});

test('400 when an update moves the start date past the stored end date', async () => {
  const created = parse(
    await handler(
      event('/', 'POST', {
        name: 'Range',
        total_budget: 5,
        start_date: '2026-01-01',
        end_date: '2026-02-01',
        members: [1],
      }),
    ),
  );

  // The request never mentions end_date, so the check has to use the stored row.
  const res = await handler(event(`/${created.project_id}`, 'PUT', { start_date: '2026-03-01' }));
  expect(res.statusCode).toBe(400);
});

test('clearing the end date in the same request that moves the start date is allowed', async () => {
  const created = parse(
    await handler(
      event('/', 'POST', {
        name: 'Reopened',
        total_budget: 5,
        start_date: '2026-01-01',
        end_date: '2026-02-01',
        members: [1],
      }),
    ),
  );

  const res = await handler(
    event(`/${created.project_id}`, 'PUT', { start_date: '2026-03-01', end_date: null }),
  );
  expect(res.statusCode).toBe(200);
});
