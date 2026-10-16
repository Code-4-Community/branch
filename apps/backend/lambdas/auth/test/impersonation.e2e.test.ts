// Mocked at the path @branch/lambda-auth resolves it from: its own node_modules, not ours.
jest.mock(require.resolve('aws-jwt-verify', { paths: [require.resolve('@branch/lambda-auth')] }), () => ({
  CognitoJwtVerifier: {
    create: () => ({ verify: async (token: string) => ({ sub: token }) }),
  },
}));

import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';
import { closeConnection } from '@branch/store';
import { handler } from '../handler';

const pool = new Pool({
  host: 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

const TARGET = 4;

beforeAll(async () => {
  process.env.COGNITO_USER_POOL_ID = 'us-east-2_test';
  process.env.COGNITO_CLIENT_ID = 'client';
  const client = await pool.connect();
  try {
    await ensureSchema(client);
  } finally {
    client.release();
  }
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await resetData(client);
    await client.query(
      `INSERT INTO branch.users (cognito_sub, name, email, is_admin, is_staff)
       VALUES ('staff-sub', 'Hidden Staff', 'staff@branch.org', false, true)`,
    );
    await client.query(`UPDATE branch.users SET cognito_sub = 'sam-sub' WHERE user_id = 6`);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
  await closeConnection();
});

function call(
  method: string,
  path: string,
  { as = 'staff-sub', session, body }: { as?: string; session?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { authorization: `Bearer ${as}` };
  if (session) headers['x-impersonate-session'] = session;
  return handler({
    rawPath: path,
    requestContext: { http: { method } },
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  }).then((res) => ({ status: res.statusCode, body: JSON.parse(res.body) }));
}

async function start(mode: 'read_only' | 'full', targetUserId = TARGET): Promise<string> {
  const res = await call('POST', '/auth/impersonation', { body: { targetUserId, mode } });
  expect(res.status).toBe(201);
  return res.body.sessionId;
}

test('a staff account on its own sees only the console', async () => {
  const me = await call('GET', '/auth/me');
  expect(me.body).toMatchObject({ isStaff: true, impersonation: null, rbac: { isStaff: true } });

  const targets = await call('GET', '/auth/impersonation/targets');
  expect(targets.status).toBe(200);
  const emails = targets.body.users.map((u: any) => u.email);
  expect(emails).toContain('sam@branch.org');
  expect(emails).not.toContain('staff@branch.org');
  expect(targets.body.users.find((u: any) => u.userId === TARGET)).toMatchObject({
    directorProjectCount: 1,
    memberProjectCount: 1,
  });
});

test('nobody but staff can open the console or start a session', async () => {
  expect((await call('GET', '/auth/impersonation/targets', { as: 'sam-sub' })).status).toBe(403);
  const res = await call('POST', '/auth/impersonation', {
    as: 'sam-sub',
    body: { targetUserId: TARGET, mode: 'full' },
  });
  expect(res.status).toBe(403);
});

test('a staff account cannot be a target, and the answer does not say it exists', async () => {
  const { rows } = await pool.query(`SELECT user_id FROM branch.users WHERE is_staff`);
  const res = await call('POST', '/auth/impersonation', {
    body: { targetUserId: rows[0].user_id, mode: 'read_only' },
  });
  expect(res.status).toBe(404);
});

test('read-only: acts as the target, refuses writes, and ends cleanly', async () => {
  const session = await start('read_only');

  const me = await call('GET', '/auth/me', { session });
  expect(me.body).toMatchObject({
    userId: TARGET,
    isStaff: false,
    rbac: { userId: TARGET, isStaff: false, directorProjectIds: [1] },
    impersonation: { sessionId: session, mode: 'read_only', name: 'Hidden Staff' },
  });

  const write = await call('POST', '/auth/impersonation', {
    session,
    body: { targetUserId: 5, mode: 'full' },
  });
  expect(write).toMatchObject({ status: 403, body: { message: 'Read-only impersonation' } });
  const audited = await pool.query(
    'SELECT status_code FROM branch.impersonation_actions WHERE session_id = $1',
    [session],
  );
  expect(audited.rows).toEqual([{ status_code: 403 }]);

  expect((await call('DELETE', `/auth/impersonation/${session}`)).status).toBe(200);
  const after = await call('GET', '/auth/me', { session });
  expect(after).toMatchObject({ status: 401, body: { code: 'IMPERSONATION_EXPIRED' } });
});

test('full: cannot chain a switch, and every write is audited with its outcome', async () => {
  const session = await start('full');

  const chained = await call('POST', '/auth/impersonation', {
    session,
    body: { targetUserId: 5, mode: 'full' },
  });
  expect(chained.status).toBe(403);

  const mfa = await call('POST', '/auth/mfa-setup', { session });
  expect(mfa).toMatchObject({ status: 403, body: { message: 'Not available while impersonating' } });

  const { rows } = await pool.query(
    `SELECT method, path, status_code FROM branch.impersonation_actions
      WHERE session_id = $1 ORDER BY created_at`,
    [session],
  );
  expect(rows).toEqual([
    { method: 'POST', path: '/auth/impersonation', status_code: 403 },
    { method: 'POST', path: '/auth/mfa-setup', status_code: 403 },
  ]);
});

test("a staff account cannot use or end another staff account's session", async () => {
  const session = await start('full');
  await pool.query(
    `INSERT INTO branch.users (cognito_sub, name, email, is_admin, is_staff)
     VALUES ('staff-2', 'Other Staff', 'staff2@branch.org', false, true)`,
  );

  const borrowed = await call('GET', '/auth/me', { as: 'staff-2', session });
  expect(borrowed).toMatchObject({ status: 401, body: { code: 'IMPERSONATION_EXPIRED' } });

  await call('DELETE', `/auth/impersonation/${session}`, { as: 'staff-2' });
  expect((await call('GET', '/auth/me', { session })).body.userId).toBe(TARGET);
});

test('the header from a non-staff caller is refused, not ignored', async () => {
  const session = await start('full');
  const res = await call('GET', '/auth/me', { as: 'sam-sub', session });
  expect(res).toMatchObject({ status: 403, body: { code: 'IMPERSONATION_FORBIDDEN' } });
});
