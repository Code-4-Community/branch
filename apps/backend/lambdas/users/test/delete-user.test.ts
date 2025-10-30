
// test("health test 🌞", async () => {
//   let res = await fetch("http://localhost:3000/users/health")
//   expect(res.status).toBe(200);
// });

// test("patch user test 🌞", async () => {
//   let res = await fetch("http://localhost:3000/users/1", {
//     method: "PATCH",
//     body: JSON.stringify({
//       name: "John Branch",
//       email: "mrbranch@example.com",
//       isAdmin: false
//     })
//   })
//   expect(res.status).toBe(200);
//   let body = await res.json().then(r => r.body);
//   console.log(body);
//   expect(body.email).toBe("mrbranch@example.com");
//   expect(body.name).toBe("John Branch");
//   expect(body.isAdmin).toBe(false);
// });


// test("patch user 404 test 🌞", async () => {
//   let res = await fetch("http://localhost:3000/users/4", {
//     method: "PATCH",
//     body: JSON.stringify({
//       name: "John Doe",
//       email: "john.doe@example.com"
//     })
//   })
//   expect(res.status).toBe(404);
// });

// test("delete user test 🌞", async () => {
//   let res = await fetch("http://localhost:3000/1", {
//     method: "DELETE"
//   });

//   expect(res.status).toBe(200);

//   let body = await res.json().then(r => r.body);

//   expect(body.ok).toBe(true);
//   expect(body.route).toBe("DELETE /users/{userId}");
//   expect(body.pathParams.userId).toBe("1");
// });

// test("delete user 404 test 🌞", async () => {
//   let res = await fetch("http://localhost:3000/9999", {
//     method: "DELETE"
//   });

//   expect(res.status).toBe(404);

//   let body = await res.json().then(r => r.body);
//   expect(body.message).toBe("User not found");
// });