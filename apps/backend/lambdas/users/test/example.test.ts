
test("health test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/health")
  expect(res.status).toBe(200);
});
