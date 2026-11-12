const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { loadProductMap, normalizeCart, readCart, writeCart, withUserTx } = require("../lib/cart");

module.exports = function cartRoutes(pool) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    res.json({ items: await readCart(pool, req.user.id) });
  });

  // Replace the whole cart with what the browser sends
  router.put("/", async (req, res) => {
    if (!req.body || !Array.isArray(req.body.items)) {
      return res.status(400).json({ error: "Expected { items: [...] }." });
    }
    const productMap = await loadProductMap(pool);
    const items = normalizeCart(req.body.items, productMap);
    await withUserTx(pool, req.user.id, client => writeCart(client, req.user.id, items));
    res.json({ items });
  });

  // Add guest-cart items to the saved cart (used right after login or signup)
  router.post("/merge", async (req, res) => {
    if (!req.body || !Array.isArray(req.body.items)) {
      return res.status(400).json({ error: "Expected { items: [...] }." });
    }
    const productMap = await loadProductMap(pool);
    const incoming = normalizeCart(req.body.items, productMap);
    const items = await withUserTx(pool, req.user.id, async client => {
      const existing = await readCart(client, req.user.id);
      const merged = normalizeCart(existing.concat(incoming), productMap);
      await writeCart(client, req.user.id, merged);
      return merged;
    });
    res.json({ items });
  });

  return router;
};
