// Products currently on sale, keyed by id
async function loadProductMap(db) {
  const { rows } = await db.query(
    "SELECT id, name, price::float8 AS price, category, sizes, image FROM products WHERE active ORDER BY id"
  );
  return new Map(rows.map(r => [r.id, r]));
}

// Turns whatever the browser sent into a clean cart. Unknown products, invalid
// sizes and bad quantities are dropped; duplicates are merged; quantity caps at 99.
function normalizeCart(rawItems, productMap) {
  const merged = new Map();
  if (!Array.isArray(rawItems)) return [];

  for (const raw of rawItems.slice(0, 200)) {
    if (!raw || typeof raw !== "object") continue;

    const productId = Number(raw.productId);
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1) continue;

    const product = productMap.get(productId);
    if (!product) continue;

    let size = typeof raw.size === "string" ? raw.size : "";
    if (!product.sizes.includes(size)) {
      if (product.sizes.length === 1) size = product.sizes[0];
      else continue;
    }

    const key = `${productId}|${size}`;
    const prev = merged.get(key);
    merged.set(key, { productId, size, quantity: Math.min(99, (prev ? prev.quantity : 0) + quantity) });
  }
  return [...merged.values()];
}

async function readCart(db, userId) {
  const { rows } = await db.query(
    `SELECT c.product_id AS "productId", c.size, c.quantity
       FROM cart_items c JOIN products p ON p.id = c.product_id AND p.active
      WHERE c.user_id = $1
      ORDER BY c.updated_at, c.product_id, c.size`,
    [userId]
  );
  return rows;
}

// Replace the user's whole cart. Caller must pass a transaction client.
async function writeCart(client, userId, items) {
  await client.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);
  if (!items.length) return;
  await client.query(
    `INSERT INTO cart_items (user_id, product_id, size, quantity)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::int[])`,
    [userId, items.map(i => i.productId), items.map(i => i.size), items.map(i => i.quantity)]
  );
}

// Runs fn inside a transaction and serialises cart changes per user
async function withUserTx(pool, userId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { loadProductMap, normalizeCart, readCart, writeCart, withUserTx };
