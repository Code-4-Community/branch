
test("health test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/health")
  expect(res.status).toBe(200);
});

test("patch user test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/1", {
    method: "PATCH",
    body: JSON.stringify({
      name: "John Branch",
      email: "mrbranch@example.com",
      isAdmin: false
    })
  })
  expect(res.status).toBe(200);
  let body = await res.json().then(r => r.body);
  console.log(body);
  expect(body.email).toBe("mrbranch@example.com");
  expect(body.name).toBe("John Branch");
  expect(body.isAdmin).toBe(false);
});


test("patch user 404 test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/4", {
    method: "PATCH",
    body: JSON.stringify({
      name: "John Doe",
      email: "john.doe@example.com"
    })
  })
  expect(res.status).toBe(404);
});

test("POST user success case", async () => {
  let res = await fetch("http://localhost:3000/users/5", {
    method: "POST",
    body: JSON.stringify({
      name: "Jane Branch",
      email: "jane1@branch.com",
      isAdmin: true
    })
  });

  expect(res.status).toBe(201);

  let body = await res.json();

  expect(body.ok).toBe(true);
  expect(body.body.name).toBe("Jane Branch");
  expect(body.body.email).toBe("jane@branch.com");
  expect(body.body.isAdmin).toBe(true);
});

test("POST user 400 case when invalid userId is sent", async () => {
  let res = await fetch("http://localhost:3000/users/invalidUserId", {
    method: "POST",
    body: JSON.stringify({
      name: "Invalid User",
      email: "",
      isAdmin: false
    })
  });

  expect(res.status).toBe(400);
});

test("POST user 400 case when request sent with missing fields", async () => {
  let res = await fetch("http://localhost:3000/users/4", {
    method: "POST",
    body: JSON.stringify({
      name: "Invalid User",
    }) // missing email and admin fields
  });

  expect(res.status).toBe(400);
});

test("POST user 409 case when user already exists", async () => {
  let res = await fetch("http://localhost:3000/users/1", {
    method: "POST",
    body: JSON.stringify({
      name: "Existing User",
      email: "some@email.com",
      isAdmin: false
    })
  });

  expect(res.status).toBe(409);
});