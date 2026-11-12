// End-to-end: the real storefront script running in jsdom against the real API + Postgres
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { createPool, initDb } = require("../server/db");
const { createApp } = require("../server/app");

const TEST_DB = process.env.TEST_DATABASE_URL || "postgres://qnc:qnc@localhost:5432/qnc_test";
const PUBLIC = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8").replace('<script src="script.js"></script>', "");
const script = fs.readFileSync(path.join(PUBLIC, "script.js"), "utf8");

let pool, server, base;

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await initDb(pool);
  const app = createApp(pool, { isProd: false, jwtSecret: "s", authRateLimitMax: 1000 });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); });

// A browser tab: jsdom + fetch with a cookie jar
async function openPage({ jar = {}, storage = {}, baseUrl = base } = {}) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: baseUrl + "/" });
  const w = dom.window;
  Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.fetch = async (url, opts = {}) => {
    const headers = new Headers(opts.headers || {});
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(new URL(url, baseUrl), { ...opts, headers });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i), val = pair.slice(i + 1);
      if (!val || /expires=Thu, 01 Jan 1970/i.test(c)) delete jar[name]; else jar[name] = val;
    }
    return res;
  };
  w.eval(script);
  const page = {
    w, jar, d: w.document,
    $: id => w.document.getElementById(id),
    async waitFor(fn, label = "condition") {
      for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 30)); }
      throw new Error("timed out waiting for " + label);
    },
    click(el) { el.click(); },
    submit(id) { page.$(id).dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); },
    nav(view) { page.click(page.d.querySelector(`.nav-link[data-view="${view}"]`)); },
    add(i) { page.click(page.d.querySelectorAll(".product-card .btn-primary")[i]); }
  };
  await page.waitFor(() => page.d.querySelectorAll(".product-card").length > 0 || page.$("shop-empty-message").textContent.includes("Couldn't"), "products");
  await new Promise(r => setTimeout(r, 50));
  return page;
}

test("full customer journey", async () => {
  const jar = {};
  const p = await openPage({ jar });
  assert.equal(p.d.querySelectorAll(".product-card").length, 12);
  assert.equal(p.d.querySelectorAll(".size-fixed").length, 3);

  // guest cart lives in localStorage
  p.add(0); p.add(9);
  assert.equal(p.$("cart-count").textContent, "2");
  assert.equal(JSON.parse(p.w.localStorage.getItem("qnc_cart")).length, 2);

  // checkout as guest -> asked to log in
  p.nav("cart"); p.click(p.$("checkout-btn"));
  assert.ok(p.d.getElementById("view-account").classList.contains("active"));
  assert.match(p.$("login-form-message").textContent, /log in or sign up/);

  // client-side validation
  p.click(p.d.querySelector('[data-auth-tab="signup"]'));
  p.$("signup-name").value = ""; p.$("signup-phone").value = "123"; p.$("signup-password").value = "abc";
  p.submit("signup-form");
  assert.ok(p.$("signup-name-error").textContent && p.$("signup-phone-error").textContent && p.$("signup-password-error").textContent);

  // sign up: guest cart merges into the server cart, user returns to cart
  p.$("signup-name").value = "Test Customer"; p.$("signup-phone").value = "0977 123 456"; p.$("signup-password").value = "secret1";
  p.submit("signup-form");
  await p.waitFor(() => p.d.getElementById("view-cart").classList.contains("active"), "cart view after signup");
  assert.equal(p.$("cart-count").textContent, "2");
  assert.equal(p.w.localStorage.getItem("qnc_cart"), null, "guest cart cleared");
  assert.equal(p.$("account-nav-btn").textContent, "Hi, Test");
  const { rows: users } = await pool.query("SELECT phone, password_hash FROM users");
  assert.equal(users[0].phone, "+260977123456");
  assert.match(users[0].password_hash, /^\$2/);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM cart_items")).rows[0].n, 2);

  // checkout creates a real order
  p.click(p.$("checkout-btn"));
  await p.waitFor(() => /Order #\d+ confirmed/.test(p.$("checkout-message").textContent), "order confirmation");
  assert.match(p.$("checkout-message").textContent, /K480\.00/);
  assert.equal(p.$("cart-count").textContent, "0");
  const { rows: orders } = await pool.query("SELECT id, total::float8 AS total FROM orders");
  assert.equal(orders.length, 1);
  assert.equal(orders[0].total, 480);

  // order history in the account panel
  p.nav("account");
  await p.waitFor(() => !p.$("orders-section").hidden && p.d.querySelectorAll(".order-card").length === 1, "order history");
  assert.match(p.d.querySelector(".order-card").textContent, /Ankara Print Shirt \(S\)/);

  // add item while logged in -> saved to DB
  p.nav("shop"); p.add(2);
  await p.waitFor(async () => true);
  for (let i = 0; i < 50; i++) {
    if ((await pool.query("SELECT count(*)::int AS n FROM cart_items")).rows[0].n === 1) break;
    await new Promise(r => setTimeout(r, 30));
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM cart_items")).rows[0].n, 1);

  // reload in a "new tab" with the same cookie: still logged in, cart restored
  const p2 = await openPage({ jar });
  assert.equal(p2.$("account-nav-btn").textContent, "Hi, Test");
  assert.equal(p2.$("cart-count").textContent, "1");

  // log out: cart and session cleared, cookie gone
  p2.nav("account"); p2.click(p2.$("logout-btn"));
  await p2.waitFor(() => p2.$("account-nav-btn").textContent === "Login", "logout");
  assert.equal(p2.$("cart-count").textContent, "0");
  assert.equal(jar.qnc_session, undefined);

  // log back in with a different phone format; flash visible; cart + orders back
  p2.nav("account");
  p2.click(p2.d.querySelector('[data-auth-tab="login"]'));
  p2.$("login-phone").value = "+260977123456"; p2.$("login-password").value = "secret1";
  p2.submit("login-form");
  await p2.waitFor(() => !p2.$("account-panel").hidden, "login");
  assert.equal(p2.$("account-flash").textContent, "Logged in successfully!");
  assert.equal(p2.$("cart-count").textContent, "1");
  await p2.waitFor(() => p2.d.querySelectorAll(".order-card").length === 1, "orders after login");
});

test("auth errors from the server show in the form", async () => {
  const p = await openPage();
  p.nav("account");

  p.$("login-phone").value = "0977123456"; p.$("login-password").value = "wrong-password";
  p.submit("login-form");
  await p.waitFor(() => !p.$("login-form-message").hidden, "login error");
  assert.match(p.$("login-form-message").textContent, /Incorrect phone number or password/);

  p.click(p.d.querySelector('[data-auth-tab="signup"]'));
  p.$("signup-name").value = "Dup"; p.$("signup-phone").value = "260977123456"; p.$("signup-password").value = "secret1";
  p.submit("signup-form");
  await p.waitFor(() => p.$("signup-phone-error").textContent.length > 0, "dup error");
  assert.match(p.$("signup-phone-error").textContent, /already exists/);
  assert.equal(p.$("signup-form").querySelector("button[type=submit]").disabled, false, "button re-enabled");
});

test("expired session: guest again with a notice", async () => {
  const jar = {};
  const p = await openPage({ jar });
  p.nav("account"); p.click(p.d.querySelector('[data-auth-tab="login"]'));
  p.$("login-phone").value = "0977123456"; p.$("login-password").value = "secret1";
  p.submit("login-form");
  await p.waitFor(() => !p.$("account-panel").hidden, "login");

  jar.qnc_session = "garbage"; // session invalidated
  p.nav("shop"); p.add(0);
  await p.waitFor(() => !p.$("toast").hidden, "session toast");
  assert.match(p.$("toast").textContent, /session expired/i);
  assert.equal(p.$("account-nav-btn").textContent, "Login");
});

test("old browser-stored accounts are removed; old guest cart kept", async () => {
  const p = await openPage({ storage: {
    qnc_users: JSON.stringify([{ fullName: "Old", phone: "+260955000111", password: "plain" }]),
    qnc_current_user: JSON.stringify({ phone: "+260955000111" }),
    "qnc_cart_+260955000111": "[]",
    plainwear_users: "[]",
    plainwear_cart: JSON.stringify([{ productId: 3, size: "L", quantity: 1 }])
  } });
  const keys = Array.from({ length: p.w.localStorage.length }, (_, i) => p.w.localStorage.key(i));
  assert.deepEqual(keys, ["qnc_cart"]);
  assert.equal(p.$("cart-count").textContent, "1");
});

test("server unreachable: friendly messages, no crash", async () => {
  const p = await openPage({ baseUrl: "http://localhost:1" });
  assert.match(p.$("shop-empty-message").textContent, /Couldn't load products/);
  assert.equal(p.d.querySelectorAll(".product-card").length, 0);
});
