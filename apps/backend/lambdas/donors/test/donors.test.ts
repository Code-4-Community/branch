import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { handler } from '../handler';
jest.mock('../auth');
import { authenticateRequest } from '../auth';
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'branch_dev',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_NAME ?? 'branch_db',
  ssl: false,
});

const seedSqlPath = path.resolve(__dirname, '../../../db/db_setup.sql');
const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

const authenticatedUser = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'staff-sub',
    userId: 1,
    email: 'person@branch.org',
    isAdmin: false,
  },
}

const adminUser = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'admin-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: true,
  },
}

function createEvent(method: string, path: string, body?: any, queryStringParameters?: Record<string, string>) {
  return {
    rawPath: path,
    requestContext: {
      http: {
        method: method,
      },
    },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: queryStringParameters ?? {},
  };
}

describe("Donor API with data", () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query(seedSql);
    } finally {
      client.release();
    }
  });

  test("health test 🌞", async () => {
    let res = await fetch("http://localhost:3000/donors/health");
    expect(res.status).toBe(200);
  });

  test("Status check for get all donors when donors exist 🌞 - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("Status check for get all donors when donors exist 🌞 - with admin", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("Content check for get all donors when donors exist 🌞 - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
  });

  test("401 when missing authorization header", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(401);
  });

  // --- Donors pagination ---

  test("GET /donors with page and limit returns paginated response", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1', limit: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.totalItems).toBe(3);
    expect(body.pagination.totalPages).toBe(3);
    expect(body.data[0].organization).toBe('NIH');
  });

  test("GET /donors page=2 limit=1 returns second donor", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '2', limit: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.length).toBe(1);
    expect(body.pagination.page).toBe(2);
    expect(body.data[0].organization).toBe('Harvard Medical');
  });

  test("GET /donors with limit larger than total returns all donors", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1', limit: '100' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.length).toBe(3);
    expect(body.pagination.totalItems).toBe(3);
    expect(body.pagination.totalPages).toBe(1);
  });

  test("GET /donors with only page returns all donors without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donors with only limit returns all donors without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { limit: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donors returns 400 for page=0", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '0', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donors returns 400 for negative page", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '-1', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donors returns 400 for non-integer page", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: 'abc', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donors returns 400 for limit=0", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1', limit: '0' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donors returns 400 for non-integer limit", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1', limit: 'abc' }));
    expect(res.statusCode).toBe(400);
  });

  // --- Donations endpoint ---

  test("GET /donations returns 200 with data array", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
  });

  test("GET /donations with page and limit returns paginated response", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1', limit: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.length).toBe(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.totalItems).toBe(3);
    expect(body.pagination.totalPages).toBe(3);
  });

  test("GET /donations with only page returns all without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donations with only limit returns all without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { limit: '2' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donations returns 400 for page=0", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '0', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donations returns 400 for non-integer limit", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1', limit: '1.5' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donations returns 401 when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('GET', '/donations'));
    expect(res.statusCode).toBe(401);
  });
  test("POST /donations returns 201 and created donation", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('POST', '/donations', {
      donor_id: 2, project_id: 1, amount: 500,
    }));
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(201);
    expect(body.data.donor_id).toBe(2);
    expect(body.data.project_id).toBe(1);
    expect(Number(body.data.amount)).toBe(500);
  });

  test("POST /donations returns 400 when donor_id is missing", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('POST', '/donations', { project_id: 1, amount: 100 }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 400 when amount is zero", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('POST', '/donations', { donor_id: 1, project_id: 1, amount: 0 }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 400 when amount is negative", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('POST', '/donations', { donor_id: 1, project_id: 1, amount: -50 }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 401 when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('POST', '/donations', { donor_id: 1, project_id: 1, amount: 100 }));
    expect(res.statusCode).toBe(401);
  });

  test("POST /donations returns 403 when user is not a project member", async () => {
  mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser); // userId: 1, not admin
  const res = await handler(createEvent('POST', '/donations', {
    donor_id: 1, project_id: 3, amount: 100, // user 1 is not a member of project 3
    }));
    expect(res.statusCode).toBe(403);
});

  // --- POST /donors ---

    test("POST /donors returns 201 for admin with organization only", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      const res = await handler(createEvent('POST', '/', { organization: 'New Foundation' }));
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.body.organization).toBe('New Foundation');
      expect(body.body.contactName).toBeNull();
      expect(body.body.contactEmail).toBeNull();
    });

    test("POST /donors returns 201 for admin with full fields", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      const res = await handler(createEvent('POST', '/', {
        organization: 'Gates Foundation',
        contact_name: 'Bill Gates',
        contact_email: 'bill@gatesfoundation.org',
      }));
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(201);
      expect(body.body.organization).toBe('Gates Foundation');
      expect(body.body.contactName).toBe('Bill Gates');
      expect(body.body.contactEmail).toBe('bill@gatesfoundation.org');

      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT * FROM branch.donors WHERE organization = 'Gates Foundation'"
        );
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].contact_email).toBe('bill@gatesfoundation.org');
      } finally {
        client.release();
      }
    });

    test("POST /donors returns 400 when organization is missing", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      const res = await handler(createEvent('POST', '/', { contact_name: 'No Org' }));
      expect(res.statusCode).toBe(400);
    });

    test("POST /donors returns 400 for invalid contact_email format", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      const res = await handler(createEvent('POST', '/', {
        organization: 'Bad Email Org',
        contact_email: 'not-an-email',
      }));
      expect(res.statusCode).toBe(400);
    });

    test("POST /donors returns 403 for non-admin authenticated user", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
      const res = await handler(createEvent('POST', '/', { organization: 'Should Fail' }));
      expect(res.statusCode).toBe(403);
    });

    test("POST /donors returns 401 when unauthenticated", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
      const res = await handler(createEvent('POST', '/', { organization: 'Should Fail' }));
      expect(res.statusCode).toBe(401);
    });

    // --- DELETE /donors/{id} ---

    test("DELETE /donors/{id} returns 200 for admin and removes the donor", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      // Donor 2 (Harvard Medical) — note this cascades and also removes donation_id 2
      const res = await handler(createEvent('DELETE', '/donors/2'));
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.pathParams.id).toBe('2');

      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM branch.donors WHERE donor_id = 2');
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    test("DELETE /donors/{id} returns 400 for non-numeric id", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      const res = await handler(createEvent('DELETE', '/donors/abc'));
      expect(res.statusCode).toBe(400);
    });

    test("DELETE /donors/{id} returns 404 for a nonexistent donor", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      const res = await handler(createEvent('DELETE', '/donors/9999'));
      expect(res.statusCode).toBe(404);
    });

    test("DELETE /donors/{id} returns 403 for non-admin authenticated user", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
      const res = await handler(createEvent('DELETE', '/donors/1'));
      expect(res.statusCode).toBe(403);
    });

    test("DELETE /donors/{id} returns 401 when unauthenticated", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
      const res = await handler(createEvent('DELETE', '/donors/1'));
      expect(res.statusCode).toBe(401);
    });

    // --- DELETE /donations/{id} ---

    test("DELETE /donations/{id} returns 200 for admin", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      // donation_id 3 belongs to project_id 3, donor_id 3
      const res = await handler(createEvent('DELETE', '/donations/3'));
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.ok).toBe(true);

      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM branch.project_donations WHERE donation_id = 3');
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    test("DELETE /donations/{id} returns 200 for a project member (PI) deleting a donation on their project", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser); // userId 1, PI on project 1
      // donation_id 1 belongs to project_id 1
      const res = await handler(createEvent('DELETE', '/donations/1'));
      expect(res.statusCode).toBe(200);
    });

    test("DELETE /donations/{id} returns 403 for a user with no membership on that donation's project", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser); // userId 1, only member of project 1
      // donation_id 2 belongs to project_id 2 — user 1 has no membership there
      const res = await handler(createEvent('DELETE', '/donations/2'));
      expect(res.statusCode).toBe(403);
    });

    test("DELETE /donations/{id} returns 400 for non-numeric id", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      const res = await handler(createEvent('DELETE', '/donations/abc'));
      expect(res.statusCode).toBe(400);
    });

    test("DELETE /donations/{id} returns 404 for a nonexistent donation", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      const res = await handler(createEvent('DELETE', '/donations/9999'));
      expect(res.statusCode).toBe(404);
    });

    test("DELETE /donations/{id} returns 401 when unauthenticated", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
      const res = await handler(createEvent('DELETE', '/donations/1'));
      expect(res.statusCode).toBe(401);
    });
  
});

describe("Donor API when DB is empty", () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('TRUNCATE TABLE branch.donors RESTART IDENTITY CASCADE;');
    } finally {
      client.release();
    }
  });

  test("Status check for get all donors when DB is empty - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("Status check for get all donors when DB is empty - with admin", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("Content check for get all donors when DB is empty - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  test("401 when missing authentication", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(401);
  });

  test("GET /donations returns empty data when DB is empty", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  test("GET /donations paginated returns 0 totalItems when DB is empty", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1', limit: '10' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.length).toBe(0);
    expect(body.pagination.totalItems).toBe(0);
    expect(body.pagination.totalPages).toBe(0);
  });
});

afterAll(async () => {
  await pool.end();
});


