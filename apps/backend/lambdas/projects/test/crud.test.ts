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

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const adminAuthResult = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

const pool = new Pool({
  host: 'localhost',
  port: Number(5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

// Build schema "branch" from db/migrations if it isn't already current. Cheap
// (one SELECT) unless a migration was added since the schema was last built.
beforeAll(async () => {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
  } finally {
    client.release();
  }
});


function getEvent(rawPath: string) {
  return {
    rawPath,
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: {},
  } as any;
}

function putEvent(rawPath: string, body: unknown) {
  return {
    rawPath,
    requestContext: { http: { method: 'PUT' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  } as any;
}

function deleteEvent(rawPath: string) {
  return {
    rawPath,
    requestContext: { http: { method: 'DELETE' } },
    headers: { Authorization: 'Bearer fake-token' },
  } as any;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue(adminAuthResult);

  const client = await pool.connect();
  try {
    await resetData(client);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
});

test("health test 🌞", async () => {
  const res = await handler(getEvent('/projects/health'));
  expect(res.statusCode).toBe(200);
});

test("get projects test 🌞", async () => {
  const res = await handler(getEvent('/projects'));
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.length).toBeGreaterThan(0);
  body.forEach((project: any) => {
    expect(project.description).toBeDefined();
    expect(project.description).not.toBeNull();
    expect(typeof project.description).toBe('string');
  });
});

test("update project test 🌞", async () => {
  const res = await handler(putEvent('/projects/1', { name: "Project 1 Updated", total_budget: 2000 }));
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.project_id).toBe(1);
  expect(body.name).toContain("Project 1 Updated");
  expect(Number(body.total_budget)).toBe(Number(2000.00));
  expect(body.description).toBeDefined();
  expect(body.description).not.toBeNull();
  expect(typeof body.description).toBe('string');
});

test("update project with new description test 🌞", async () => {
  const newDesc = "Updated project description";
  const res = await handler(putEvent('/projects/1', { name: "Project 1", description: newDesc }));
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.description).toBe(newDesc);
});

test("project put 404 test 🌞", async () => {
  const res = await handler(putEvent('/projects/1000', { name: "Project 1 Updated", total_budget: 2000 }));
  expect(res.statusCode).toBe(404);
  const body = JSON.parse(res.body);
  expect(body.message).toBe("Project not found for id: 1000");
});

test("get project by id test 🌞", async () => {
  const res = await handler(getEvent('/projects/1'));
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.project_id).toBe(1);
  expect(body.name).toContain("Clinician Communication Study");
});

test("project get 400 test 🌞", async () => {
  const res = await handler(getEvent('/projects/1000'));
  expect(res.statusCode).toBe(404);
  const body = JSON.parse(res.body);
  expect(body.message).toBe("Project not found for id: 1000");
});

test("update project ignores protected fields 🌞", async () => {
  const beforeRes = await handler(getEvent('/projects/1'));
  expect(beforeRes.statusCode).toBe(200);
  const before = JSON.parse(beforeRes.body);

  const res = await handler(putEvent('/projects/1', {
    name: "Project 1 Sanitized",
    project_id: 9999,
    created_at: "2000-01-01T00:00:00.000Z",
  }));

  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.project_id).toBe(1);
  expect(body.name).toBe("Project 1 Sanitized");

  const afterRes = await handler(getEvent('/projects/1'));
  expect(afterRes.statusCode).toBe(200);
  const after = JSON.parse(afterRes.body);
  expect(after.project_id).toBe(1);
  expect(after.created_at).toBe(before.created_at);
});

test("delete project test 🌞", async () => {
  let res = await handler(deleteEvent('/projects/1'));
  expect(res.statusCode).toBe(200);
  let body = JSON.parse(res.body);
  expect(body.ok).toBe(true);
  expect(body.pathParams.id).toBe("1");

  // confirm it's actually gone
  let getRes = await handler(getEvent('/projects/1'));
  expect(getRes.statusCode).toBe(404);
});

test("delete project 404 test 🌞", async () => {
  let res = await handler(deleteEvent('/projects/1000'));
  expect(res.statusCode).toBe(404);
  let body = JSON.parse(res.body);
  expect(body.message).toBe("Project not found");
});

test("delete project invalid id test 🌞", async () => {
  let res = await handler(deleteEvent('/projects/abc'));
  expect(res.statusCode).toBe(400);
});

test("delete project with dependent expenditures test 🌞", async () => {
  let res = await handler(deleteEvent('/projects/1'));
  expect(res.statusCode).toBe(200);
  let body = JSON.parse(res.body);
  expect(body.ok).toBe(true);
});
