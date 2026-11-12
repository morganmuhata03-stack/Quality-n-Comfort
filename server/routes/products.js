const express = require("express");

module.exports = function productRoutes(pool) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name, price::float8 AS price, category, sizes, image FROM products WHERE active ORDER BY id"
    );
    res.json({ products: rows });
  });

  return router;
};
