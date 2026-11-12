require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const { createPool, initDb } = require("./db");
const { createApp } = require("./app");

async function main() {
  const isProd = process.env.NODE_ENV === "production";

  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProd) throw new Error("JWT_SECRET must be set in production.");
    jwtSecret = crypto.randomBytes(32).toString("hex");
    console.warn("JWT_SECRET not set: using a temporary one (everyone is logged out on restart).");
  }

  const pool = createPool(process.env.DATABASE_URL);
  await initDb(pool);

  const app = createApp(pool, { isProd, jwtSecret, authRateLimitMax: 30 });
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => console.log(`Quality N Comfort running on http://localhost:${port}`));

  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(err => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
