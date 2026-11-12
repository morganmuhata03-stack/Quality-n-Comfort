const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createPool, initDb } = require("../server/db");
const { createApp } = require("../server/app");

const TEST_DB = process.env.TEST_DATABASE_URL || "postgres://qnc:qnc@localhost:5432/qnc_test";
const config = { isProd: false, jwtSecret: "test-secret", authRateLimitMax: 1000 };
let pool, app;

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await initDb(pool);
  app = createApp(pool, config);
});
after(() => pool.end());

const signup = (agent, name, phone, password = "secret1") =>
  agent.post("/api/auth/signup").send({ fullName: name, phone, password });

test("health and products", async () => {
  const h = await request(app).get("/api/health");
  assert.equal(h.status, 200);
  const r = await request(app).get("/api/products");
  assert.equal(r.body.products.length, 12);
  const cap = r.body.products.find(p => p.id === 10);
  assert.deepEqual(cap.sizes, ["One Size"]);
  assert.equal(typeof cap.price, "number");
});

test("seeding is idempotent and never overwrites edits", async () => {
  await pool.query("UPDATE products SET price = 999 WHERE id = 1");
  await initDb(pool);
  const { rows } = await pool.query("SELECT price::float8 AS price FROM products WHERE id = 1");
  assert.equal(rows[0].price, 999);
  await pool.query("UPDATE products SET price = 320 WHERE id = 1");
});

test("signup normalises phone, hashes password, sets httpOnly cookie", async () => {
  const agent = request.agent(app);
  const res = await signup(agent, "  Dell   Test ", "0977 123 456");
  assert.equal(res.status, 201);
  assert.equal(res.body.user.phone, "+260977123456");
  assert.equal(res.body.user.fullName, "Dell Test");
  assert.equal(res.body.user.password, undefined);
  assert.equal(res.body.user.password_hash, undefined);
  const cookie = res.headers["set-cookie"][0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  const { rows } = await pool.query("SELECT password_hash FROM users WHERE phone = '+260977123456'");
  assert.match(rows[0].password_hash, /^\$2[aby]\$/);
  assert.ok(!rows[0].password_hash.includes("secret1"));

  const me = await agent.get("/api/auth/me");
  assert.equal(me.body.user.fullName, "Dell Test");
});

test("signup validation and duplicates across phone formats", async () => {
  const bad = await signup(request(app), "", "12345", "abc");
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.fullName && bad.body.errors.phone && bad.body.errors.password);

  for (const fmt of ["+260 977 123 456", "260977123456", "977123456", "00260977123456"]) {
    const dup = await signup(request(app), "Dup", fmt);
    assert.equal(dup.status, 409, fmt);
    assert.ok(dup.body.errors.phone);
  }
  const long = await signup(request(app), "X", "0971110000", "a".repeat(73));
  assert.equal(long.status, 400);
});

test("login works with any phone format, rejects wrong password, logout clears session", async () => {
  for (const fmt of ["0977123456", "+260977123456", "977123456"]) {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/login").send({ phone: fmt, password: "secret1" });
    assert.equal(res.status, 200, fmt);
    assert.equal((await agent.get("/api/auth/me")).body.user.phone, "+260977123456");
  }
  const bad = await request(app).post("/api/auth/login").send({ phone: "0977123456", password: "nope" });
  assert.equal(bad.status, 401);
  const unknown = await request(app).post("/api/auth/login").send({ phone: "0955000000", password: "secret1" });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, bad.body.error); // same message: doesn't reveal which numbers exist

  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ phone: "0977123456", password: "secret1" });
  await agent.post("/api/auth/logout");
  assert.equal((await agent.get("/api/auth/me")).body.user, null);
});

test("garbage / tampered session cookie means logged out", async () => {
  const res = await request(app).get("/api/cart").set("Cookie", "qnc_session=not.a.jwt");
  assert.equal(res.status, 401);
});

test("cart, orders require login", async () => {
  assert.equal((await request(app).get("/api/cart")).status, 401);
  assert.equal((await request(app).put("/api/cart").send({ items: [] })).status, 401);
  assert.equal((await request(app).post("/api/orders")).status, 401);
  assert.equal((await request(app).get("/api/orders")).status, 401);
});

test("cart: PUT cleans input, GET returns it, per-user isolation", async () => {
  const alice = request.agent(app);
  await signup(alice, "Alice", "0971111111");
  const put = await alice.put("/api/cart").send({ items: [
    { productId: 1, size: "M", quantity: 2, price: 0.01 },   // price ignored
    { productId: 1, size: "M", quantity: 1 },                // merged -> 3
    { productId: 999, size: "M", quantity: 1 },              // unknown product
    { productId: 2, size: "XXL", quantity: 1 },              // bad size
    { productId: 3, size: "L", quantity: -4 },               // bad qty
    { productId: 10, size: "XL", quantity: 1 },              // old size on One Size item -> mapped
    { productId: 4, size: "S", quantity: 500 },              // capped at 99
    "junk", null
  ] });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body.items, [
    { productId: 1, size: "M", quantity: 3 },
    { productId: 10, size: "One Size", quantity: 1 },
    { productId: 4, size: "S", quantity: 99 }
  ]);
  assert.equal((await alice.get("/api/cart")).body.items.length, 3);

  const bob = request.agent(app);
  await signup(bob, "Bob", "0972222222");
  assert.deepEqual((await bob.get("/api/cart")).body.items, []);

  assert.equal((await alice.put("/api/cart").send({ items: "x" })).status, 400);
  assert.equal((await alice.put("/api/cart").send({ items: [] })).body.items.length, 0);
});

test("cart merge adds guest items to the saved cart", async () => {
  const carol = request.agent(app);
  await signup(carol, "Carol", "0973333333");
  await carol.put("/api/cart").send({ items: [{ productId: 1, size: "M", quantity: 1 }] });
  const merged = await carol.post("/api/cart/merge").send({ items: [
    { productId: 1, size: "M", quantity: 2 },
    { productId: 5, size: "L", quantity: 1 }
  ] });
  assert.deepEqual(merged.body.items.sort((a, b) => a.productId - b.productId), [
    { productId: 1, size: "M", quantity: 3 },
    { productId: 5, size: "L", quantity: 1 }
  ]);
});

test("checkout: total from DB prices, order saved, cart cleared, history listed", async () => {
  const dave = request.agent(app);
  await signup(dave, "Dave", "0974444444");

  const empty = await dave.post("/api/orders");
  assert.equal(empty.status, 400);

  await dave.put("/api/cart").send({ items: [
    { productId: 1, size: "M", quantity: 2 },    // 320 x2
    { productId: 10, size: "One Size", quantity: 1 } // 160
  ] });
  // change a price in the DB: checkout must use the DB value, and order stores a snapshot
  await pool.query("UPDATE products SET price = 350 WHERE id = 1");
  const res = await dave.post("/api/orders").send({ total: 1 });
  assert.equal(res.status, 201);
  assert.equal(res.body.order.total, 860); // 350*2 + 160
  assert.equal(res.body.order.items.length, 2);
  assert.equal((await dave.get("/api/cart")).body.items.length, 0);

  await pool.query("UPDATE products SET price = 320, name = 'Renamed' WHERE id = 1");
  const list = await dave.get("/api/orders");
  assert.equal(list.body.orders.length, 1);
  assert.equal(list.body.orders[0].total, 860);
  const shirt = list.body.orders[0].items.find(i => i.productId === 1);
  assert.equal(shirt.unitPrice, 350);
  assert.equal(shirt.name, "Ankara Print Shirt"); // snapshot, not the renamed product
  await pool.query("UPDATE products SET name = 'Ankara Print Shirt' WHERE id = 1");

  const other = request.agent(app);
  await signup(other, "Eve", "0975555555");
  assert.equal((await other.get("/api/orders")).body.orders.length, 0);
});

test("inactive products disappear from catalogue and cart", async () => {
  const fay = request.agent(app);
  await signup(fay, "Fay", "0976666666");
  await fay.put("/api/cart").send({ items: [{ productId: 12, size: "One Size", quantity: 1 }] });
  await pool.query("UPDATE products SET active = FALSE WHERE id = 12");
  assert.equal((await request(app).get("/api/products")).body.products.length, 11);
  assert.equal((await fay.get("/api/cart")).body.items.length, 0);
  assert.equal((await fay.post("/api/orders")).status, 400);
  await pool.query("UPDATE products SET active = TRUE WHERE id = 12");
});

test("concurrent cart writes don't corrupt the cart", async () => {
  const gus = request.agent(app);
  await signup(gus, "Gus", "0977777777");
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    gus.put("/api/cart").send({ items: [{ productId: 1, size: "M", quantity: i + 1 }] })
  ));
  assert.ok(results.every(r => r.status === 200));
  const items = (await gus.get("/api/cart")).body.items;
  assert.equal(items.length, 1);
});

test("security headers, bad JSON, unknown api route, rate limit", async () => {
  const res = await request(app).get("/");
  assert.match(res.headers["content-security-policy"], /script-src 'self'/);
  assert.match(res.headers["content-security-policy"], /images\.pexels\.com/);
  assert.equal(res.headers["x-powered-by"], undefined);

  const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{oops");
  assert.equal(bad.status, 400);
  assert.equal((await request(app).get("/api/nope")).status, 404);

  const limited = createApp(pool, { ...config, authRateLimitMax: 3 });
  let last;
  for (let i = 0; i < 5; i++) last = await request(limited).post("/api/auth/login").send({ phone: "0977123456", password: "x" });
  assert.equal(last.status, 429);
});
