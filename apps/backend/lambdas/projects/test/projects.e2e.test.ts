import { handler } from '../handler';
import db from '../db';

beforeAll(() => {
  process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
  process.env.DB_PORT = process.env.DB_PORT ?? '5432';
  process.env.DB_USER = process.env.DB_USER ?? 'branch_dev';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'password';
  process.env.DB_NAME = process.env.DB_NAME ?? 'branch_db';
});

function postEvent(body: unknown) {
  return {
    rawPath: '/projects',
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify(body),
  } as any;
}

function getExpendituresEvent(id: string) {
  return {
    rawPath: `/projects/${id}/expenditures`,
    requestContext: { http: { method: 'GET' } },
  } as any;
}

describe('POST /projects (e2e)', () => {
  test('201 creates project with number budget', async () => {
    const res = await handler(postEvent({ name: 'Proj A', total_budget: 1000 }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.name).toBe('Proj A');
    expect(json.project_id).toBeDefined();
  });

  test('201 creates project with numeric string budget', async () => {
    const res = await handler(postEvent({ name: 'Proj B', total_budget: '2500.50' }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.name).toBe('Proj B');
  });

  test('201: creates project with all fields (e2e)', async () => {
    const res = await handler(postEvent({
      name: 'AllFieldsE2E',
      total_budget: '2500.50',
      start_date: '2025-03-01',
      end_date: '2025-09-30',
      currency: 'EUR',
      description: 'End-to-end project description',
    }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.name).toBe('AllFieldsE2E');
    expect(json.total_budget).toBeDefined();
    expect(json.start_date).toContain('2025-03-01');
    expect(json.end_date).toContain('2025-09-30');
    expect(json.currency).toBe('EUR');
    expect(json.description).toBe('End-to-end project description');
  });

  test('400 when name missing', async () => {
    const res = await handler(postEvent({ total_budget: 10 }));
    expect(res.statusCode).toBe(400);
  });

  test('400 when total_budget invalid', async () => {
    const res = await handler(postEvent({ name: 'X', total_budget: 'abc' }));
    expect(res.statusCode).toBe(400);
  });

  test('201 with only required name (optional omitted)', async () => {
    const res = await handler(postEvent({ name: 'Minimal' }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.description).toBe(''); // description defaults to empty string
  });

  test('201: creates project with empty string description', async () => {
    const res = await handler(postEvent({ name: 'EmptyDesc', description: '' }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.description).toBe('');
  });

  test('400: description exceeds 1000 characters', async () => {
    const longDesc = 'a'.repeat(1001);
    const res = await handler(postEvent({ name: 'LongDesc', description: longDesc }));
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.message).toContain('1000');
  });

  test('201: creates project with exactly 1000 character description', async () => {
    const desc1000 = 'a'.repeat(1000);
    const res = await handler(postEvent({ name: 'MaxDesc', description: desc1000 }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.description).toBe(desc1000);
  });
});

describe('GET /projects/{id}/expenditures (e2e)', () => {
  test('get expenditures for project 1 test 🌞', async () => {
    const res = await handler(getExpendituresEvent('1'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
  });

  test('expenditures 404 test 🌞', async () => {
    const res = await handler(getExpendituresEvent('99999'));
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Project not found');
  });

  test('expenditures ordered by spent_on test 🌞', async () => {
    const res = await handler(getExpendituresEvent('1'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    if (body.length > 1) {
      for (let i = 0; i < body.length - 1; i++) {
        const current = new Date(body[i].spent_on);
        const next = new Date(body[i + 1].spent_on);
        expect(current >= next).toBe(true);
      }
    }
  });
});

afterAll(async () => {
  await db.destroy();
});