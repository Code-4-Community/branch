jest.mock('../auth');
import { handler } from '../handler';
import { authenticateRequest } from '../auth';
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const adminUser = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

function postEvent(body: Record<string, unknown>) {
  return {
    rawPath: '/projects',
    requestContext: { http: { method: 'POST' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  };
}

beforeEach(() => {
  mockAuthenticateRequest.mockResolvedValue(adminUser);
});

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
  });
});