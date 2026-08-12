/**
 * Dependency-free mock of the BRANCH API, for exercising the frontend without
 * Docker, Postgres or Cognito.
 *
 * It stands in for every microservice at once, which is why the frontend must
 * be started with a single base URL override:
 *
 *   node apps/frontend/mock-api/server.mjs
 *   NEXT_PUBLIC_API_BASE_URL=http://localhost:4010 npm run dev
 *
 * State is in-memory: restarting the server resets the data. Sign in with any
 * email and password. Use `?admin=0` on the login request (or set
 * MOCK_ADMIN=false) to see the non-admin view, which hides the create/edit
 * controls.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_API_PORT ?? 4010);

// ── Token helpers ────────────────────────────────────────────────────────────

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');

/**
 * A JWT-shaped, unsigned token. The frontend never verifies signatures — it
 * only decodes `exp` to schedule refreshes — so this is enough to drive the
 * real session code path rather than stubbing around it.
 */
function makeToken(hoursValid = 12) {
  const exp = Math.floor(Date.now() / 1000) + hoursValid * 3600;
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: 'mock-sub', exp })}.mock`;
}

// ── Seed data ────────────────────────────────────────────────────────────────

let isAdmin = process.env.MOCK_ADMIN !== 'false';

const staff = [
  { user_id: 1, name: 'Ashley Rivera', email: 'ashley@branch.org', profile_image: null },
  { user_id: 2, name: 'Ben Ortiz', email: 'ben@branch.org', profile_image: null },
  { user_id: 3, name: 'Carla Nguyen', email: 'carla@branch.org', profile_image: null },
  { user_id: 4, name: 'Dev Patel', email: 'dev@branch.org', profile_image: null },
  { user_id: 5, name: 'Elena Fischer', email: 'elena@branch.org', profile_image: null },
  { user_id: 6, name: 'Farouk Diallo', email: 'farouk@branch.org', profile_image: null },
];

let nextProjectId = 6;

/** Fixture dates are relative to today so the active/archived split never goes stale. */
function daysFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const projects = [
  {
    project_id: 1,
    name: 'Clinician Communication Study',
    description:
      "This project's overview/short description..... (1-2 sentences about the project/what it is for)",
    total_budget: '100000.00',
    currency: 'USD',
    start_date: '2026-01-01',
    end_date: null,
    created_at: '2026-01-01T00:00:00.000Z',
    members: [1, 2, 3, 4, 5],
  },
  {
    project_id: 2,
    name: 'Health Education Initiative',
    description: 'Community health workshops across three counties.',
    total_budget: '100000.00',
    currency: 'USD',
    start_date: '2026-02-01',
    end_date: null,
    created_at: '2026-02-01T00:00:00.000Z',
    members: [2, 3, 4],
  },
  {
    project_id: 3,
    name: 'Rural Telehealth Pilot',
    description: 'Remote consultations for patients more than 50 miles from a clinic.',
    total_budget: '100000.00',
    currency: 'USD',
    start_date: '2026-03-01',
    // Ends in the future, so it stays in the Active section.
    end_date: daysFromToday(120),
    created_at: '2026-03-01T00:00:00.000Z',
    members: [1, 5, 6],
  },
  {
    project_id: 4,
    // Deliberately long, to check the card's two-line clamp.
    name: 'Longitudinal Patient Outcomes and Follow-Up Care Coordination Programme',
    description: 'Completed programme, retained for reporting.',
    total_budget: '100000.00',
    currency: 'USD',
    start_date: daysFromToday(-400),
    end_date: daysFromToday(-60),
    created_at: '2025-01-01T00:00:00.000Z',
    members: [1, 2, 3],
  },
  {
    project_id: 5,
    name: 'Adolescent Nutrition Survey',
    description: 'Closed out last quarter.',
    total_budget: '75000.00',
    currency: 'USD',
    start_date: daysFromToday(-300),
    end_date: daysFromToday(-30),
    created_at: '2025-06-01T00:00:00.000Z',
    members: [4, 5],
  },
];

const CATEGORIES = ['Visitor / Honorarium', 'Travel', 'Equipment', 'Catering'];
const STATUSES = ['approved', 'pending', 'needs_more_info', 'pending'];

/** Deterministic expenditures, so a reload shows the same numbers. */
const expenditures = projects.flatMap((project) =>
  Array.from({ length: 6 }, (_, i) => ({
    expenditure_id: project.project_id * 100 + i,
    project_id: project.project_id,
    entered_by: 1,
    amount: ((i + 1) * 2500).toFixed(2),
    category: CATEGORIES[i % CATEGORIES.length],
    description: 'Mock expenditure',
    status: STATUSES[i % STATUSES.length],
    receipt_url: i % 2 === 0 ? 'https://example.com/receipt.pdf' : null,
    admin_notes: null,
    spent_on: `2026-0${(i % 9) + 1}-15`,
    created_at: '2026-01-01T00:00:00.000Z',
  })),
);

// ── Derived shapes ───────────────────────────────────────────────────────────

const todayIso = () => new Date().toISOString().slice(0, 10);
const isActive = (project) => !project.end_date || project.end_date >= todayIso();
const spentOn = (projectId) =>
  expenditures
    .filter((e) => e.project_id === projectId)
    .reduce((sum, e) => sum + Number(e.amount), 0);

// Strips the membership list; the API exposes it only via /overview.
function publicProject(project) {
  const rest = { ...project };
  delete rest.members;
  return rest;
}

function summarise(project) {
  return {
    ...publicProject(project),
    total_spent: spentOn(project.project_id),
    member_count: project.members.length,
    is_active: isActive(project),
  };
}

function overview(project) {
  const totalBudget = Number(project.total_budget ?? 0);
  const totalSpent = spentOn(project.project_id);
  return {
    project: publicProject(project),
    stats: {
      totalBudget,
      totalSpent,
      totalRemaining: totalBudget - totalSpent,
      spentPercentage: totalBudget > 0 ? Number(((totalSpent / totalBudget) * 100).toFixed(2)) : 0,
      totalDonated: 0,
      memberCount: project.members.length,
      expenditureCount: expenditures.filter((e) => e.project_id === project.project_id).length,
    },
    members: project.members
      .map((userId) => staff.find((s) => s.user_id === userId))
      .filter(Boolean)
      .map((person) => ({ ...person, role: 'Student' })),
    expenditures: expenditures.filter((e) => e.project_id === project.project_id),
    isActive: isActive(project),
    canEdit: isAdmin,
  };
}

// ── Request handling ─────────────────────────────────────────────────────────

function send(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/** Mirrors the backend's own validation, so the error states are reachable. */
function validateWrite(body, existing) {
  const start = 'start_date' in body ? body.start_date : existing?.start_date;
  const end = 'end_date' in body ? body.end_date : existing?.end_date;
  if (start && end && end < start) {
    return "'end_date' must be on or after 'start_date'";
  }
  if (body.members) {
    const unknown = body.members.filter((id) => !staff.some((s) => s.user_id === Number(id)));
    if (unknown.length) return `Unknown user ids: ${unknown.join(', ')}`;
  }
  if (!existing && !String(body.name ?? '').trim()) return "'name' is required";
  return null;
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') return send(res, 204);

  console.log(`${method} ${pathname}`);

  // ── auth ──
  if (pathname === '/auth/login' || pathname === '/auth/refresh') {
    const body = await readJson(req);
    if (body.admin === false) isAdmin = false;
    return send(res, 200, {
      AccessToken: makeToken(),
      IdToken: makeToken(),
      RefreshToken: 'mock-refresh-token',
    });
  }

  if (pathname === '/auth/me') {
    return send(res, 200, {
      userId: 1,
      cognitoSub: 'mock-sub',
      email: 'ashley@branch.org',
      name: 'Ashley Rivera',
      isAdmin,
      profileImage: null,
    });
  }

  if (pathname === '/auth/logout') return send(res, 204);

  // ── projects ──
  // Declared before the /{id} routes, as in the real handler.
  if (pathname === '/projects/assignable-staff' && method === 'GET') {
    return send(res, 200, { staff });
  }

  if (pathname === '/projects' && method === 'GET') {
    return send(res, 200, projects.map(summarise));
  }

  if (pathname === '/projects' && method === 'POST') {
    const body = await readJson(req);
    const error = validateWrite(body);
    if (error) return send(res, 400, { message: error });

    const created = {
      project_id: nextProjectId++,
      name: body.name,
      description: body.description ?? '',
      total_budget: body.total_budget != null ? Number(body.total_budget).toFixed(2) : null,
      currency: 'USD',
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      created_at: new Date().toISOString(),
      members: (body.members ?? []).map(Number),
    };
    projects.push(created);
    return send(res, 201, publicProject(created));
  }

  const overviewMatch = /^\/projects\/(\d+)\/overview$/.exec(pathname);
  if (overviewMatch && method === 'GET') {
    const project = projects.find((p) => p.project_id === Number(overviewMatch[1]));
    if (!project) return send(res, 404, { message: 'Project not found' });
    return send(res, 200, overview(project));
  }

  const expendituresMatch = /^\/projects\/(\d+)\/expenditures$/.exec(pathname);
  if (expendituresMatch && method === 'GET') {
    return send(
      res,
      200,
      expenditures.filter((e) => e.project_id === Number(expendituresMatch[1])),
    );
  }

  const idMatch = /^\/projects\/(\d+)$/.exec(pathname);
  if (idMatch) {
    const project = projects.find((p) => p.project_id === Number(idMatch[1]));
    if (!project) return send(res, 404, { message: 'Project not found' });

    if (method === 'GET') return send(res, 200, publicProject(project));

    if (method === 'PUT') {
      const body = await readJson(req);
      const error = validateWrite(body, project);
      if (error) return send(res, 400, { message: error });

      for (const key of ['name', 'description', 'start_date', 'end_date']) {
        if (key in body) project[key] = body[key];
      }
      if ('total_budget' in body && body.total_budget != null) {
        project.total_budget = Number(body.total_budget).toFixed(2);
      }
      if (Array.isArray(body.members)) project.members = body.members.map(Number);

      return send(res, 200, publicProject(project));
    }
  }

  // Endpoints other pages poll for; enough to keep them from erroring.
  // `/projects/dashboard` is the dashboard route on the projects service.
  if ((pathname === '/projects/dashboard' || pathname === '/dashboard') && method === 'GET') {
    const active = projects.filter(isActive);
    return send(res, 200, {
      summary: {
        totalProjects: projects.length,
        totalBudget: projects.reduce((sum, p) => sum + Number(p.total_budget ?? 0), 0),
        totalSpent: projects.reduce((sum, p) => sum + spentOn(p.project_id), 0),
        totalDonations: 0,
      },
      projects: active.map((p) => ({
        project_id: p.project_id,
        name: p.name,
        total_budget: Number(p.total_budget ?? 0),
        spent: spentOn(p.project_id),
        staff_count: p.members.length,
      })),
      monthlyExpenses: [],
    });
  }
  if (pathname === '/expenditures' && method === 'GET') return send(res, 200, expenditures);
  if (pathname === '/health') return send(res, 200, { ok: true });

  send(res, 404, { message: `No mock route for ${method} ${pathname}` });
});

server.listen(PORT, () => {
  console.log(`Mock BRANCH API listening on http://localhost:${PORT}`);
  console.log(`Start the frontend with:`);
  console.log(`  NEXT_PUBLIC_API_BASE_URL=http://localhost:${PORT} npm run dev`);
});
