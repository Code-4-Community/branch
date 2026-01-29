import { handler } from '../handler';

function createEvent(path: string, method: string, body?: any) {
  return {
    rawPath: path,
    requestContext: {
      http: {
        method: method,
      },
    },
    body: body ? JSON.stringify(body) : undefined,
  };
}

test("health check returns 200", async () => {
  const res = await handler(createEvent('/health', 'GET'));
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.ok).toBe(true);
});

test("missing email returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    password: "TestPassword123",
    name: "Test User"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("required");
});

test("missing password returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    email: "test@example.com",
    name: "Test User"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("required");
});

test("missing name returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    email: "test@example.com",
    password: "TestPassword123"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("required");
});

test("invalid email format returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    email: "not-an-email",
    password: "TestPassword123",
    name: "Test User"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toBe("Invalid email format");
});

test("short password returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    email: "test@example.com",
    password: "Pass1",
    name: "Test User"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("at least 8 characters");
});

test("password missing lowercase returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    email: "test@example.com",
    password: "PASSWORD123",
    name: "Test User"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("lowercase");
});

test("password missing uppercase returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    email: "test@example.com",
    password: "password123",
    name: "Test User"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("uppercase");
});

test("password missing number returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    email: "test@example.com",
    password: "Password",
    name: "Test User"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("number");
});

test("short name returns 400", async () => {
  const res = await handler(createEvent('/register', 'POST', {
    email: "test@example.com",
    password: "TestPassword123",
    name: "A"
  }));

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("at least 2 characters");
});

test("invalid path returns 404", async () => {
  const res = await handler(createEvent('/invalid-path', 'POST', {
    email: "test@example.com",
    password: "TestPassword123",
    name: "Test User"
  }));

  expect(res.statusCode).toBe(404);
});
