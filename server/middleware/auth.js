const jwt = require("jsonwebtoken");

const COOKIE_NAME = "qnc_session";
const SESSION_DAYS = 7;

function sessionCookieOptions(config) {
  return {
    httpOnly: true,          // not readable by page JavaScript
    sameSite: "lax",         // not sent on cross-site POSTs
    secure: config.isProd,   // HTTPS only in production
    path: "/"
  };
}

function setSession(res, userId, config) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE_NAME, token, {
    ...sessionCookieOptions(config),
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  });
}

function clearSession(res, config) {
  res.clearCookie(COOKIE_NAME, sessionCookieOptions(config));
}

// Looks up the logged-in user (if any) on every request, so deleted users lose access at once
function attachUser(pool, config) {
  return async (req, res, next) => {
    req.user = null;
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return next();
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const { rows } = await pool.query(
        "SELECT id, full_name, phone FROM users WHERE id = $1",
        [payload.sub]
      );
      if (rows[0]) req.user = rows[0];
    } catch {
      // invalid or expired token: treat as logged out
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please log in." });
  next();
}

module.exports = { setSession, clearSession, attachUser, requireAuth };
