"use strict";

/**
 * Bot admin IDs. Two sources are merged:
 *   - BOT_ADMIN_IDS environment variable (read on every check)
 *   - IDs saved from the dashboard, kept in DATA_DIR/admins.json
 * Only numeric Messenger user IDs are accepted.
 */
const fs = require("fs");
const path = require("path");

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const adminsFile = path.join(dataDir, "admins.json");

function parseIds(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return [...new Set(raw.split(/[\s,;]+/).map(x => x.trim()).filter(x => /^\d{5,20}$/.test(x)))].slice(0, 100);
}

function readStored() {
  try { return parseIds(JSON.parse(fs.readFileSync(adminsFile, "utf8")).admin_ids); }
  catch (_) { return []; }
}

let stored = readStored();

function getStoredAdminIds() { return stored.slice(); }

function setStoredAdminIds(value) {
  const input = Array.isArray(value) ? value.join(",") : String(value || "");
  const ids = parseIds(input);
  const tokens = input.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  if (tokens.length && tokens.length !== ids.length && !tokens.every(t => ids.includes(t))) {
    const bad = tokens.filter(t => !/^\d{5,20}$/.test(t));
    if (bad.length) throw new Error("Admin IDs must be numeric Messenger user IDs. Invalid: " + bad.slice(0, 3).join(", "));
  }
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(adminsFile, JSON.stringify({ admin_ids: ids }, null, 2) + "\n", { mode: 0o600 });
  stored = ids;
  return ids.slice();
}

function isBotAdmin(senderID) {
  const id = String(senderID || "").trim();
  if (!id) return false;
  return parseIds(process.env.BOT_ADMIN_IDS).includes(id) || stored.includes(id);
}

module.exports = { isBotAdmin, getStoredAdminIds, setStoredAdminIds, parseIds };
