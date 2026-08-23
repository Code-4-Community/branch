import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';
import { handler } from '../handler';
import db from '../db';
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


// Seed user 1 is a Director on project 1, which is what makes them able to read
// the donor roster (`donors:view` is admin + director) while still being scoped
// to their own project's donations.
const authenticatedUser = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'staff-sub',
    userId: 1,
    email: 'person@branch.org',
    isAdmin: false,
  },
}

// Seed user 3 is a Student on project 2 only -- no memberships on projects 1 or
// 3, and not a director anywhere.
const studentUser = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'student-sub',
    userId: 3,
    email: 'nour@branch.org',
    isAdmin: false,
  },
}

// A real, authenticated user who is on no project at all. Not a seeded id:
// every seeded user has a membership, and this case is about having none.
const strangerUser = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'stranger-sub',
    userId: 99,
    email: 'stranger@branch.org',
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
      await resetData(client);
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

  // The donor roster is the one page that separates a director from a student.
  test("GET /donors returns 403 for a project member who directs nothing", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(studentUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toMatch(/directors/i);
  });

  test("GET /donors returns 200 for a director", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("GET /donations returns every donation to an admin", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/donations'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
  });

  // Seeded user 1 directs project 1 only, and the seed puts one donation on
  // each of projects 1-3. Scoping happens in SQL, so the other two never leave
  // the database.
  test("GET /donations returns only the caller's projects to a non-admin", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.map((d: { project_id: number }) => d.project_id)).toEqual([1]);
  });

  test("GET /donations returns nothing to a user on no projects", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(strangerUser);
    const res = await handler(createEvent('GET', '/donations'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data).toEqual([]);
  });

  test("GET /donations paginates within the caller's scope, count included", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1', limit: '10' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    // 1, not 3: a total the caller may not read would leak the other projects.
    expect(body.pagination.totalItems).toBe(1);
    expect(body.data).toHaveLength(1);
  });

  test("GET /donors/donations reaches the donations controller, not the /donors/:id route", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/donors/donations'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
    expect(body.data[0]).toHaveProperty('donation_id');
  });

  test("GET /donations with page and limit returns paginated response", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
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
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donations with only limit returns all without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { limit: '2' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donations returns 400 for page=0", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '0', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donations returns 400 for non-integer limit", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1', limit: '1.5' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donations returns 401 when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('GET', '/donations'));
    expect(res.statusCode).toBe(401);
  });
  test("POST /donations returns 201 and created donation", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('POST', '/donations', {
      donor_id: 2, project_id: 1, amount: 500,
    }));
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(201);
    expect(body.data.donor_id).toBe(2);
    expect(body.data.project_id).toBe(1);
    expect(Number(body.data.amount)).toBe(500);
  });

  test("POST /donations honours an explicit donated_at", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('POST', '/donations', {
      donor_id: 2, project_id: 1, amount: 500, donated_at: '2024-03-12',
    }));
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(201);
    expect(new Date(body.data.donated_at).toISOString()).toContain('2024-03-12');
  });

  test("POST /donations returns 400 when donated_at is not a date", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('POST', '/donations', {
      donor_id: 2, project_id: 1, amount: 500, donated_at: 'not-a-date',
    }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 400 when donor_id is missing", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('POST', '/donations', { project_id: 1, amount: 100 }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 400 when amount is zero", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('POST', '/donations', { donor_id: 1, project_id: 1, amount: 0 }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 400 when amount is negative", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
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

    test("DELETE /donations/{id} returns 200 for an admin", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
      // donation_id 1 belongs to project_id 1
      const res = await handler(createEvent('DELETE', '/donations/1'));
      expect(res.statusCode).toBe(200);
    });

    // Donations are admin-only to write. A Director on the very project the
    // donation belongs to is still refused -- this is the rule that changed.
    test("DELETE /donations/{id} returns 403 for a Director on that donation's project", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser); // userId 1, Director on project 1
      const res = await handler(createEvent('DELETE', '/donations/1'));
      expect(res.statusCode).toBe(403);
    });

    test("DELETE /donations/{id} returns 403 for a user with no membership on that donation's project", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(studentUser); // userId 3, member of project 2 only
      // donation_id 1 belongs to project_id 1 -- user 3 has no membership there
      const res = await handler(createEvent('DELETE', '/donations/1'));
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
  await db.destroy();
});


