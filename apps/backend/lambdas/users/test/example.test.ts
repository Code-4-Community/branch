
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