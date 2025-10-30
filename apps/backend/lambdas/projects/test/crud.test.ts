
test("health test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/health")
  expect(res.status).toBe(200);
});

test("get projects test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects")
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);
  expect(body.length).toBeGreaterThan(0);
});
