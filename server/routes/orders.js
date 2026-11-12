const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { withUserTx } = require("../lib/cart");

const mapItem = r => ({
  productId: r.product_id,
  name: r.product_name,
  size: r.size,
  unitPrice: r.unit_price,
  quantity: r.quantity
});

module.exports = function orderRoutes(pool) {
  const router = express.Router();
  router.use(requireAuth);

  // Checkout: turns the saved cart into an order. Prices always come from the
  // products table, never from the browser. Payment is not processed (demo).
  router.post("/", async (req, res) => {
    const order = await withUserTx(pool, req.user.id, async client => {
      const { rows: lines } = await client.query(
        `SELECT p.id AS product_id, p.name AS product_name, p.price::float8 AS unit_price,
                c.size, c.quantity
           FROM cart_items c JOIN products p ON p.id = c.product_id AND p.active
          WHERE c.user_id = $1
          ORDER BY c.updated_at, p.id, c.size`,
        [req.user.id]
      );
      if (!lines.length) return null;

      const cents = lines.reduce((sum, l) => sum + Math.round(l.unit_price * 100) * l.quantity, 0);
      const total = (cents / 100).toFixed(2);

      const { rows: [created] } = await client.query(
        "INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id, status, created_at",
        [req.user.id, total]
      );
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, size, unit_price, quantity)
         SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::numeric[], $6::int[])`,
        [
          created.id,
          lines.map(l => l.product_id),
          lines.map(l => l.product_name),
          lines.map(l => l.size),
          lines.map(l => l.unit_price),
          lines.map(l => l.quantity)
        ]
      );
      await client.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);

      return {
        id: created.id,
        status: created.status,
        createdAt: created.created_at,
        total: Number(total),
        items: lines.map(mapItem)
      };
    });

    if (!order) return res.status(400).json({ error: "Your cart is empty." });
    res.status(201).json({ order });
  });

  router.get("/", async (req, res) => {
    const { rows: orders } = await pool.query(
      `SELECT id, status, total::float8 AS total, created_at
         FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 50`,
      [req.user.id]
    );
    const ids = orders.map(o => o.id);
    const { rows: items } = ids.length
      ? await pool.query(
          `SELECT order_id, product_id, product_name, size, unit_price::float8 AS unit_price, quantity
             FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id`,
          [ids]
        )
      : { rows: [] };

    res.json({
      orders: orders.map(o => ({
        id: o.id,
        status: o.status,
        total: o.total,
        createdAt: o.created_at,
        items: items.filter(i => i.order_id === o.id).map(mapItem)
      }))
    });
  });

  return router;
};
