import { handler } from '../handler';
import db from '../db';

function event(body: unknown) {
  return {
    rawPath: '/projects',
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify(body),
  } as any;
}

beforeAll(() => {
  process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
  process.env.DB_PORT = process.env.DB_PORT ?? '5432';
  process.env.DB_USER = process.env.DB_USER ?? 'branch_dev';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'password';
  process.env.DB_NAME = process.env.DB_NAME ?? 'branch_db';
});

test('201: creates project with number budget', async () => {
  const res = await handler(event({ name: 'Proj Number', total_budget: 1000 }));
  expect(res.statusCode).toBe(201);
  const json = JSON.parse(res.body);
  expect(json.name).toBe('Proj Number');
  expect(json.project_id).toBeDefined();
  expect(json.total_budget).toBeDefined();
});

test('201: creates project with numeric string budget', async () => {
  const res = await handler(event({ name: 'Proj String', total_budget: '2500.50' }));
  expect(res.statusCode).toBe(201);
  const json = JSON.parse(res.body);
  expect(json.name).toBe('Proj String');
});

test('201: creates minimal project with only name', async () => {
  const res = await handler(event({ name: 'Minimal' }));
  expect(res.statusCode).toBe(201);
  const json = JSON.parse(res.body);
  expect(json.description).toBe('');
});

test('201: creates project with empty string description', async () => {
  const res = await handler(event({ name: 'EmptyDesc', description: '' }));
  expect(res.statusCode).toBe(201);
  const json = JSON.parse(res.body);
  expect(json.description).toBe('');
});

test('201: creates project with whitespace-only description', async () => {
  const res = await handler(event({ name: 'WhitespaceDesc', description: '   ' }));
  expect(res.statusCode).toBe(201);
  const json = JSON.parse(res.body);
  expect(json.description).toBe('');
});

test('201: creates project with all fields', async () => {
  const res = await handler({
    rawPath: '/',
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      name: 'AllFieldsUnit',
      total_budget: 12345.67,
      start_date: '2025-01-01',
        end_date: '2025-12-31',
        currency: 'USD',
        description: 'Unit test project description',
    }),
  } as any);
  expect(res.statusCode).toBe(201);
  const json = JSON.parse(res.body);
  expect(json.name).toBe('AllFieldsUnit');
  expect(json.total_budget).toBeDefined();
  expect(json.start_date).toContain('2025-01-01');
  expect(json.end_date).toContain('2025-12-31');
  expect(json.currency).toBe('USD');
  expect(json.description).toBe('Unit test project description');
});

test('201: creates project with exactly 1000 character description', async () => {
  const desc1000 = 'a'.repeat(1000);
  const res = await handler(event({ name: 'MaxDesc', description: desc1000 }));
  expect(res.statusCode).toBe(201);
  const json = JSON.parse(res.body);
  expect(json.description).toBe(desc1000);
});

// Validation errors (400)
test('400: missing name', async () => {
  const res = await handler(event({ total_budget: 10 }));
  expect(res.statusCode).toBe(400);
});

test('400: invalid total_budget non-numeric', async () => {
  const res = await handler(event({ name: 'X', total_budget: 'abc' }));
  expect(res.statusCode).toBe(400);
});

test('400: invalid start_date format', async () => {
  const res = await handler(event({ name: 'X', start_date: '2025/01/01' }));
  expect(res.statusCode).toBe(400);
});

test('400: invalid end_date format', async () => {
  const res = await handler(event({ name: 'X', end_date: '01-01-2025' }));
  expect(res.statusCode).toBe(400);
});

test('400: currency empty or too long', async () => {
  const empty = await handler(event({ name: 'X', currency: '' }));
  expect(empty.statusCode).toBe(400);

  const tooLong = await handler(event({ name: 'X', currency: 'ABCDEFGHIJK' })); // 11 chars
  expect(tooLong.statusCode).toBe(400);
});

test('400: description exceeds 1000 characters', async () => {
  const longDesc = 'a'.repeat(1001);
  const res = await handler(event({ name: 'LongDesc', description: longDesc }));
  expect(res.statusCode).toBe(400);
  const json = JSON.parse(res.body);
  expect(json.message).toContain('1000');
});

function getExpendituresEvent(id: string) {
  return {
    rawPath: `/projects/${id}/expenditures`,
    requestContext: { http: { method: 'GET' } },
  } as any;
}

test('200: returns expenditures array', async () => {
  const res = await handler(getExpendituresEvent('1'));
  expect(res.statusCode).toBe(200);
  const json = JSON.parse(res.body);
  expect(Array.isArray(json)).toBe(true);
});

test('404: project not found', async () => {
  const res = await handler(getExpendituresEvent('99999'));
  expect(res.statusCode).toBe(404);
  const json = JSON.parse(res.body);
  expect(json.message).toBe('Project not found');
});

test('500: invalid id causes error', async () => {
  const res = await handler(getExpendituresEvent('invalid'));
  expect(res.statusCode).toBe(500);
  const json = JSON.parse(res.body);
  expect(json.message).toContain('Failed to fetch expenditures');
});

afterAll(async () => {
  await db.destroy();
});
