const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const seedProducts = require("./products-seed");

function createPool(connectionString) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(connectionString);
  return new Pool({
    connectionString,
    // Hosted Postgres (Neon, Supabase, Render) requires TLS; local dev doesn't use it
    ssl: isLocal || process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
    max: 5
  });
}

// Creates tables if missing and inserts any starter products that don't exist yet
async function initDb(pool) {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);

  for (const p of seedProducts) {
    await pool.query(
      `INSERT INTO products (id, name, price, category, sizes, image)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.price, p.category, p.sizes, p.image]
    );
  }
}

module.exports = { createPool, initDb };
