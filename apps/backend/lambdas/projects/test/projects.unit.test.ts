import { handler } from '../handler';

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
    }),
  } as any);
  expect(res.statusCode).toBe(201);
  const json = JSON.parse(res.body);
  expect(json.name).toBe('AllFieldsUnit');
  expect(json.total_budget).toBeDefined();
  expect(json.start_date).toBe('2025-01-01T05:00:00.000Z');
  expect(json.end_date).toBe('2025-12-31T05:00:00.000Z');
  expect(json.currency).toBe('USD');
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
