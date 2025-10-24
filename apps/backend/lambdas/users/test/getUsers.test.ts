test("get users test", async () => {
  let res = await fetch("http://localhost:3000/users")
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);
  expect(body.users).toBeDefined();
  expect(Array.isArray(body.users)).toBe(true);
  expect(body.users.length).toBe(3);

  const firstUser = body.users[0];
  expect(firstUser.created_at).toBe("2025-10-20T21:19:52.978Z");
  expect(firstUser.email).toBe("ashley@branch.org");
  expect(firstUser.is_admin).toBe(true);
  expect(firstUser.name).toBe("Ashley Duggan");
  expect(firstUser.user_id).toBe(1);

  const secondUser = body.users[1];
  expect(secondUser.created_at).toBe("2025-10-20T21:19:52.978Z");
  expect(secondUser.email).toBe("renee@branch.org");
  expect(secondUser.is_admin).toBe(true);
  expect(secondUser.name).toBe("Renee Reddy");
  expect(secondUser.user_id).toBe(2);

  const thirdUser = body.users[2];
  expect(thirdUser.created_at).toBe("2025-10-20T21:19:52.978Z");
  expect(thirdUser.email).toBe("nour@branch.org");
  expect(thirdUser.is_admin).toBe(true);
  expect(thirdUser.name).toBe("Nour Shoreibah");
  expect(thirdUser.user_id).toBe(3);
});

test("get users with correct pagnation", async () => {
  let res = await fetch("http://localhost:3000/users?page=1&limit=1")
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);
  expect(body.pagination).toBeDefined();
  expect(body.pagination.page).toBe(1);
  expect(body.pagination.limit).toBe(1);
  expect(body.pagination.totalUsers).toBe(3);
  expect(body.pagination.totalPages).toBe(3);

  expect(body.users).toBeDefined();
  expect(body.users.length).toBe(1);

  const firstUser = body.users[0];
  expect(firstUser.created_at).toBe("2025-10-20T21:19:52.978Z");
  expect(firstUser.email).toBe("ashley@branch.org");
  expect(firstUser.is_admin).toBe(true);
  expect(firstUser.name).toBe("Ashley Duggan");
  expect(firstUser.user_id).toBe(1);
});

test("get users with only page", async () => {
  let res = await fetch("http://localhost:3000/users?page=1")
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);

  expect(body.pagination).toBeUndefined();

  expect(body.users).toBeDefined();
  expect(body.users.length).toBe(3);
});

test("get users with only limit", async () => {
  let res = await fetch("http://localhost:3000/users?limit=1")
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);

  expect(body.pagination).toBeUndefined();

  expect(body.users).toBeDefined();
  expect(body.users.length).toBe(3);
});

test("get users with limit above total user", async () => {
  let res = await fetch("http://localhost:3000/users?page=1&limit=100")
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);
  expect(body.pagination).toBeDefined();
  expect(body.pagination.page).toBe(1);
  expect(body.pagination.limit).toBe(100);
  expect(body.pagination.totalUsers).toBe(3);
  expect(body.pagination.totalPages).toBe(1);

  expect(body.users).toBeDefined();
  expect(body.users.length).toBe(3);
});

test("get users error", async () => {
  let res = await fetch("http://localhost:3000/user")
  expect(res.status).toBe(404);
});