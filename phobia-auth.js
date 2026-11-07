"use strict";

/**
 * Phobia dashboard password gate.
 *
 * Password: set PHOBIA_PASSWORD in the host environment (recommended). If it is
 * not set, the salted scrypt hash below is used. To change the built-in hash:
 *   node phobia-auth.js "new password"
 * and paste the printed values into SALT and HASH.
 *
 * Login tokens are signed (HMAC) so dashboard logins survive a restart when
 * SESSION_SECRET is set; otherwise a random per-boot key is used.
 */
const crypto = require("crypto");

const SALT = "phobia-v1-97540cc56fe30e11";
const HASH = "3e7944bc2ed4c8267d32a7c3dfaf3c310a2472366f75aa13607704db1d1826ea";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const MAX_TRACKED = 2000;

const signingKey = process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 12
  ? crypto.createHash("sha256").update("phobia-token:" + process.env.SESSION_SECRET).digest()
  : crypto.randomBytes(32);
const revoked = new Set();
const fails = new Map();

function derive(password, salt) { return crypto.scryptSync(String(password), salt, 32); }
function wantedHash() {
  const envPassword = process.env.PHOBIA_PASSWORD;
  return envPassword ? derive(envPassword, SALT) : Buffer.from(HASH, "hex");
}
function passwordMatches(password) {
  const given = derive(password, SALT);
  const wanted = wantedHash();
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}
function clientKey(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || "unknown";
}
function sign(payload) { return crypto.createHmac("sha256", signingKey).update(payload).digest("hex"); }

function readToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const payload = parts[0] + "." + parts[1];
  const given = Buffer.from(parts[2], "hex");
  const wanted = Buffer.from(sign(payload), "hex");
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return { exp, nonce: parts[1] };
}

function login(req, password) {
  const key = clientKey(req);
  const rec = fails.get(key) || { count: 0, until: 0 };
  if (rec.until > Date.now()) {
    return { ok: false, status: 429, error: "Too many attempts. Try again in a few minutes." };
  }
  if (!passwordMatches(password)) {
    rec.count += 1;
    if (rec.count >= MAX_FAILS) { rec.count = 0; rec.until = Date.now() + LOCK_MS; }
    fails.delete(key);
    fails.set(key, rec);
    while (fails.size > MAX_TRACKED) fails.delete(fails.keys().next().value);
    return { ok: false, status: 401, error: "Wrong password." };
  }
  fails.delete(key);
  const payload = (Date.now() + TOKEN_TTL_MS) + "." + crypto.randomBytes(8).toString("hex");
  return { ok: true, token: payload + "." + sign(payload), expiresInMs: TOKEN_TTL_MS };
}

function isAuthed(req) {
  const token = String(req.headers["x-phobia-token"] || "");
  const info = readToken(token);
  return Boolean(info) && !revoked.has(info.nonce);
}

function logout(req) {
  const info = readToken(String(req.headers["x-phobia-token"] || ""));
  if (!info) return;
  revoked.add(info.nonce);
  while (revoked.size > MAX_TRACKED) revoked.delete(revoked.values().next().value);
}

module.exports = { login, isAuthed, logout };

if (require.main === module && process.argv[2]) {
  const salt = "phobia-v1-" + crypto.randomBytes(8).toString("hex");
  console.log('const SALT = "' + salt + '";');
  console.log('const HASH = "' + derive(process.argv[2], salt).toString("hex") + '";');
}
