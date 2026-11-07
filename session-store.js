"use strict";

/**
 * Facebook session storage.
 *
 * Always kept in process memory. When SESSION_SECRET is set, the session is
 * also saved ENCRYPTED (AES-256-GCM) so it survives restarts:
 *   1. a Postgres/Neon table, if a database URL is configured (survives Render
 *      Free spin-downs and redeploys), and
 *   2. a file in DATA_DIR (survives plain restarts when the disk is kept).
 * Without SESSION_SECRET nothing is written anywhere and the old behavior
 * (memory only) applies.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAX_SESSION_BYTES = 120 * 1024;
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const sessionFile = path.join(dataDir, "session.enc");
const DB_KEY = "facebook_session";

let savedCookie = null;
let lastSavedAt = null;
let lastPersistError = null;
let loadedFrom = null;
let pool = null;
let persistQueue = Promise.resolve();

function secretKey() {
  const secret = String(process.env.SESSION_SECRET || "");
  if (secret.length < 12) return null;
  return crypto.scryptSync(secret, "phobia-session-v1", 32);
}
function databaseUrl() {
  return process.env.PHOBIA_DATABASE_URL || process.env.ECLIPSE_LICENSE_DATABASE_URL || process.env.DATABASE_URL || "";
}
function getPool() {
  const url = databaseUrl();
  if (!url) return null;
  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: url, max: 1, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
      ssl: /sslmode=require/i.test(url) ? { rejectUnauthorized: false } : undefined
    });
    pool.on("error", error => console.warn("[SESSION] database pool error:", error?.message || error));
  }
  return pool;
}

function encrypt(text, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}
function decrypt(blob, key) {
  const parsed = JSON.parse(blob);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64")), decipher.final()]).toString("utf8");
}

function normalizeSessionInput(value) {
  if (typeof value !== "string") throw new Error("Paste a cookie string or a JSON appstate export.");
  const input = value.trim();
  if (!input || Buffer.byteLength(input, "utf8") > MAX_SESSION_BYTES) {
    throw new Error("Paste a valid session (maximum 120 KB).");
  }
  if (input.startsWith("[") || input.startsWith("{")) {
    let parsed;
    try { parsed = JSON.parse(input); }
    catch (_) { throw new Error("The JSON appstate is invalid. Paste the complete cookie array or appstate object."); }
    const entries = Array.isArray(parsed) ? parsed :
      Array.isArray(parsed?.appState) ? parsed.appState :
      Array.isArray(parsed?.cookies) ? parsed.cookies : null;
    if (!entries) throw new Error("JSON must be a cookie array or an object containing an appState or cookies array.");
    const parts = entries.map(cookie => {
      const name = cookie?.key ?? cookie?.name;
      const val = cookie?.value;
      if (name == null || val == null) return null;
      const safeName = String(name).trim();
      if (!safeName || /[=;\s]/.test(safeName) || /[\r\n;]/.test(String(val))) return null;
      return safeName + "=" + String(val);
    }).filter(Boolean);
    if (!parts.length) throw new Error("The appstate contains no valid cookie entries with name/key and value.");
    const normalized = parts.join("; ");
    if (Buffer.byteLength(normalized, "utf8") > MAX_SESSION_BYTES) throw new Error("Normalized cookie session exceeds 120 KB.");
    if (!/(?:^|;\s*)c_user=[^;]+/i.test(normalized)) throw new Error("Appstate must include a c_user cookie.");
    return normalized;
  }
  if (/[\r\n]/.test(input)) throw new Error("Cookie-header format must be a single line. For multiline exports, paste the complete JSON appstate instead.");
  if (!/(?:^|;\s*)c_user=[^;]+/i.test(input)) throw new Error("Cookie string must include a c_user cookie. Alternatively, paste the complete JSON appstate export.");
  return input;
}

function persist(value) {
  const key = secretKey();
  if (!key) return Promise.resolve();
  const blob = value == null ? null : encrypt(value, key);
  persistQueue = persistQueue.then(async () => {
    const errors = [];
    try {
      if (blob == null) { fs.rmSync(sessionFile, { force: true }); }
      else {
        fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
        const tmp = sessionFile + ".tmp";
        fs.writeFileSync(tmp, blob, { mode: 0o600 });
        fs.renameSync(tmp, sessionFile);
      }
    } catch (error) { errors.push("file: " + (error?.message || error)); }
    const db = getPool();
    if (db) {
      try {
        await db.query("CREATE TABLE IF NOT EXISTS phobia_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
        if (blob == null) await db.query("DELETE FROM phobia_kv WHERE key=$1", [DB_KEY]);
        else await db.query("INSERT INTO phobia_kv (key,value,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()", [DB_KEY, blob]);
      } catch (error) { errors.push("database: " + (error?.message || error)); }
    }
    lastPersistError = errors.length ? errors.join("; ").slice(0, 300) : null;
    if (lastPersistError) console.warn("[SESSION] persistence issue:", lastPersistError);
  }).catch(() => {});
  return persistQueue;
}

// Load a previously saved session. Call once at startup, before login.
async function init() {
  const key = secretKey();
  if (!key || savedCookie) return status();
  const db = getPool();
  if (db) {
    try {
      const result = await db.query("SELECT value FROM phobia_kv WHERE key=$1", [DB_KEY]);
      if (result.rows[0]) { savedCookie = decrypt(result.rows[0].value, key); loadedFrom = "database"; }
    } catch (error) { console.warn("[SESSION] could not load from database:", error?.message || error); }
  }
  if (!savedCookie) {
    try { savedCookie = decrypt(fs.readFileSync(sessionFile, "utf8"), key); loadedFrom = "file"; }
    catch (error) { if (error && error.code !== "ENOENT") console.warn("[SESSION] could not load saved session:", error?.message || error); }
  }
  if (savedCookie) console.log("[SESSION] restored saved session from " + loadedFrom + ".");
  return status();
}

function save(value) {
  savedCookie = normalizeSessionInput(value);
  lastSavedAt = new Date().toISOString();
  persist(savedCookie);
  return { saved: true, storage: describeStorage() };
}
function read() { return savedCookie; }
function clear() { savedCookie = null; lastSavedAt = null; persist(null); return { configured: false, storage: describeStorage() }; }

function describeStorage() {
  if (!secretKey()) return "memory";
  return getPoolConfigured() ? "encrypted database + file" : "encrypted file";
}
function getPoolConfigured() { return Boolean(databaseUrl()); }

function status() {
  const persistent = Boolean(secretKey());
  return {
    configured: Boolean(savedCookie),
    storage: describeStorage(),
    survivesRestart: persistent,
    survivesRedeploy: persistent && getPoolConfigured(),
    restoredFrom: loadedFrom,
    lastSavedAt,
    lastPersistError,
    hint: persistent ? null : "Set SESSION_SECRET (12+ characters) to keep the session after restarts."
  };
}

async function close() {
  await persistQueue.catch(() => {});
  if (pool) { const p = pool; pool = null; await p.end().catch(() => {}); }
}

module.exports = { init, save, read, status, clear, close, normalizeSessionInput };
