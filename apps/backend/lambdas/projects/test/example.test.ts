
test("health test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/health")
  expect(res.status).toBe(200);
});

