const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { normalizePhone, isValidPhone } = require("../lib/phone");
const { setSession, clearSession } = require("../middleware/auth");

const PHONE_ERROR = "Enter a valid phone number, e.g. 0977 123 456 or +260 977 123 456.";
// Compared against when the phone isn't registered, so login timing doesn't reveal which numbers exist
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const publicUser = row => ({ id: row.id, fullName: row.full_name, phone: row.phone });

module.exports = function authRoutes(pool, config) {
  const router = express.Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in a few minutes." }
  });

  router.get("/me", (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  router.post("/signup", limiter, async (req, res) => {
    const body = req.body || {};
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    const password = typeof body.password === "string" ? body.password : "";

    const errors = {};
    if (!fullName) errors.fullName = "Full name is required.";
    else if (fullName.length > 80) errors.fullName = "Full name must be 80 characters or fewer.";

    if (!body.phone) errors.phone = "Phone number is required.";
    else if (!isValidPhone(phone)) errors.phone = PHONE_ERROR;

    if (!password) errors.password = "Password is required.";
    else if (password.length < 6) errors.password = "Password must be at least 6 characters.";
    else if (Buffer.byteLength(password) > 72) errors.password = "Password is too long (72 characters maximum).";

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: "Please fix the highlighted fields.", errors });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const { rows } = await pool.query(
        `INSERT INTO users (full_name, phone, password_hash)
         VALUES ($1, $2, $3) RETURNING id, full_name, phone`,
        [fullName, phone, passwordHash]
      );
      setSession(res, rows[0].id, config);
      res.status(201).json({ user: publicUser(rows[0]) });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: "An account with this phone number already exists.",
          errors: { phone: "An account with this phone number already exists." }
        });
      }
      throw err;
    }
  });

  router.post("/login", limiter, async (req, res) => {
    const body = req.body || {};
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    const password = typeof body.password === "string" ? body.password : "";

    const errors = {};
    if (!body.phone) errors.phone = "Phone number is required.";
    else if (!isValidPhone(phone)) errors.phone = PHONE_ERROR;
    if (!password) errors.password = "Password is required.";
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: "Please fix the highlighted fields.", errors });
    }

    const { rows } = await pool.query(
      "SELECT id, full_name, phone, password_hash FROM users WHERE phone = $1",
      [phone]
    );
    const user = rows[0];
    const matches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !matches) {
      return res.status(401).json({ error: "Incorrect phone number or password." });
    }

    setSession(res, user.id, config);
    res.json({ user: publicUser(user) });
  });

  router.post("/logout", (req, res) => {
    clearSession(res, config);
    res.json({ ok: true });
  });

  return router;
};
