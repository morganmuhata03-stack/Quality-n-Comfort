const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { attachUser } = require("./middleware/auth");

function createApp(pool, config) {
  const app = express();
  app.disable("x-powered-by");
  // Behind Render/Railway/etc. the real client IP and HTTPS come from the proxy
  if (config.isProd) app.set("trust proxy", 1);

  // The storefront loads Google Fonts and Pexels photos; everything else must be same-origin
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "https://fonts.googleapis.com"],
    "font-src": ["https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "https://images.pexels.com"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"]
  };
  // http://localhost would otherwise be force-upgraded to https
  if (!config.isProd) directives["upgrade-insecure-requests"] = null;
  app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives } }));

  app.use(express.json({ limit: "20kb" }));
  app.use(cookieParser());

  app.get("/api/health", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use("/api", attachUser(pool, config));
  app.use("/api/auth", require("./routes/auth")(pool, config));
  app.use("/api/products", require("./routes/products")(pool));
  app.use("/api/cart", require("./routes/cart")(pool));
  app.use("/api/orders", require("./routes/orders")(pool));

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  app.use(express.static(path.join(__dirname, "..", "public")));

  // Bad JSON, unexpected errors
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request too large." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}

module.exports = { createApp };
