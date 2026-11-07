"use strict";

/**
 * Per-thread no-repeat memory. A reply that was used recently in a thread is
 * skipped; pickBanatReply returns null when every candidate was used recently
 * (the caller then falls back to a plain random pick).
 */
const MAX_THREADS = 500;
const WINDOW = Math.max(3, Number(process.env.BANAT_NO_REPEAT_WINDOW || 15));
const recent = new Map();

function keyOf(threadID) { return String(threadID || "global"); }

function pickBanatReply(threadID, list) {
  if (!Array.isArray(list) || !list.length) return null;
  const used = new Set(recent.get(keyOf(threadID)) || []);
  const candidates = list.filter(item => !used.has(item));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function rememberBanatReply(threadID, reply) {
  if (!reply) return;
  const key = keyOf(threadID);
  const history = recent.get(key) || [];
  history.push(reply);
  while (history.length > WINDOW) history.shift();
  recent.delete(key);
  recent.set(key, history);
  while (recent.size > MAX_THREADS) recent.delete(recent.keys().next().value);
}

function resetBanatMemory() { recent.clear(); }

module.exports = { pickBanatReply, rememberBanatReply, resetBanatMemory };
