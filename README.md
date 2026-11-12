# Quality N Comfort

Online store for African-print clothing, priced in Kwacha. Node.js + Express API, PostgreSQL database, and the static storefront in `public/` served by the same app.

## What the backend does
- **Accounts**: sign up / log in with phone number + password. Phones are stored as `+260…` (so `0977 123 456` and `+260 977 123 456` are one account). Passwords are hashed with bcrypt; the login cookie is `HttpOnly`.
- **Products**: the catalogue lives in the database and the site reads it from `/api/products`.
- **Carts**: guests use the browser; logged-in customers have a cart saved in the database, and guest items merge in at login.
- **Orders**: checkout turns the saved cart into an order. Prices always come from the database, and each order keeps a snapshot of names and prices.
- **Safety**: rate-limited login/signup, security headers (CSP), input validation, per-user data isolation.

**Not built yet:** payments (checkout records the order; you collect payment yourself for now, and MTN/Airtel Money would be the next step), password reset, and an admin screen.

## Run it on your computer
1. Install Node 18+ and get a Postgres database (easiest: a free one from Neon, see below; or install Postgres locally).
2. `npm install`
3. `cp .env.example .env`, then fill in `DATABASE_URL` and `JWT_SECRET`.
4. `npm start`, then open http://localhost:3000

On first start the tables are created and the 12 starter products are added automatically. Restarts never overwrite changes you make to products.

Run the tests (they use a separate database and **wipe it**): create an empty database, then
`TEST_DATABASE_URL=postgres://user:pass@localhost:5432/qnc_test npm test`

## Free hosting (database + website)
**1. Database: Neon (free Postgres)**
1. Sign up at neon.tech and create a project.
2. Copy the connection string (`postgres://…`). That is your `DATABASE_URL`.

Supabase also offers free Postgres and works the same way: use its connection string.

**2. Website: Render**
1. Push this folder to a GitHub repo.
2. On render.com: New → Web Service → pick the repo. Build command `npm install`, start command `npm start`. (Or use the included `render.yaml` as a Blueprint.)
3. Add environment variables: `DATABASE_URL` (from Neon), `JWT_SECRET` (a long random string), `NODE_ENV=production`.
4. Deploy. Free plans change over time and usually put idle apps to sleep, so the first visit after a quiet spell can be slow. Check each provider's current free limits.

## Running the shop day to day
Use Neon's SQL editor (or any Postgres client):

```sql
-- New orders, with customer details
SELECT o.id, u.full_name, u.phone, o.total, o.status, o.created_at
FROM orders o JOIN users u ON u.id = o.user_id
ORDER BY o.id DESC;

-- What was in order 12
SELECT product_name, size, quantity, unit_price FROM order_items WHERE order_id = 12;

-- Mark an order paid / shipped / delivered / cancelled
UPDATE orders SET status = 'paid' WHERE id = 12;

-- Change a price, hide a product, add one
UPDATE products SET price = 350 WHERE id = 1;
UPDATE products SET active = FALSE WHERE id = 12;
INSERT INTO products (id, name, price, category, sizes, image)
VALUES (13, 'Ankara Bucket Hat', 150, 'accessories', ARRAY['One Size'], 'https://…');
```

## API (all JSON)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/products` | public |
| POST | `/api/auth/signup`, `/login`, `/logout` | sets / clears the session cookie |
| GET | `/api/auth/me` | `{ user }` or `{ user: null }` |
| GET / PUT | `/api/cart` | logged in; PUT replaces the cart |
| POST | `/api/cart/merge` | adds guest items to the saved cart |
| POST | `/api/orders` | checkout from the saved cart |
| GET | `/api/orders` | your order history |
| GET | `/api/health` | database check |

## Project layout
```
server/    index.js (start), app.js, db.js, schema.sql, products-seed.js, routes/, lib/, middleware/
public/    index.html, script.js, style.css, images/   (the storefront)
tests/     api.test.js, frontend.test.js
```

## Keep in mind
You are storing customers' names and phone numbers. Keep `DATABASE_URL` and `JWT_SECRET` private (never commit `.env`) and read up on Zambia's data-protection rules before launch.
