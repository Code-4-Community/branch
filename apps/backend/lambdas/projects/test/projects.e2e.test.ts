// E2E tests require the dev server running at http://localhost:3000/projects

const base = 'http://localhost:3000/projects';

describe('POST /projects (e2e)', () => {
  test('201 creates project with number budget', async () => {
    const res = await fetch(`${base}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Proj A', total_budget: 1000 }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe('Proj A');
    expect(json.project_id).toBeDefined();
  });

  test('201 creates project with numeric string budget', async () => {
    const res = await fetch(`${base}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Proj B', total_budget: '2500.50' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe('Proj B');
  });

  test('201: creates project with all fields (e2e)', async () => {
    const res = await fetch('http://localhost:3000/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'AllFieldsE2E',
        total_budget: '2500.50',
        start_date: '2025-03-01',
        end_date: '2025-09-30',
        currency: 'EUR',
        description: 'End-to-end project description',
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe('AllFieldsE2E');
    expect(json.total_budget).toBeDefined();
    expect(json.start_date).toContain('2025-03-01');
    expect(json.end_date).toContain('2025-09-30');
    expect(json.currency).toBe('EUR');
    expect(json.description).toBe('End-to-end project description');
  });

  test('400 when name missing', async () => {
    const res = await fetch(`${base}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_budget: 10 }),
    });
    expect(res.status).toBe(400);
  });

  test('400 when total_budget invalid', async () => {
    const res = await fetch(`${base}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', total_budget: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  test('201 with only required name (optional omitted)', async () => {
    const res = await fetch(`${base}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Minimal' }),
    });
    expect(res.status).toBe(201);
  });
});