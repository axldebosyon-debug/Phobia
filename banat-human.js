"use strict";

/**
 * Sends one Banat reply the way a person would: small text imperfections,
 * a reaction delay, a typing indicator, then the send through the traffic
 * queue supplied by index.js. Resolves to the send result, or false when the
 * message was not delivered.
 */
const { humanize } = require("./human-mimic");
const { calculateHumanDelay } = require("./human-delay");
const { withTyping } = require("./human-typing");
const { BANAT_SHORTHANDS } = require("./banat-abbreviations");
const { getGlobalSettings } = require("./bot-settings");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// thread -> timestamps of recent replies, used to pick chill/normal/rushed.
const activity = new Map();
const ACTIVITY_WINDOW_MS = 90_000;

function trackActivity(threadID) {
  const key = String(threadID);
  const now = Date.now();
  const list = (activity.get(key) || []).filter(t => now - t < ACTIVITY_WINDOW_MS);
  list.push(now);
  activity.delete(key);
  activity.set(key, list);
  while (activity.size > 300) activity.delete(activity.keys().next().value);
  return list.length;
}

async function sendBanatReplyWithTyping(api, text, threadID, replyToMessageID = null, options = {}) {
  const send = options.trafficSendMessage;
  if (typeof send !== "function") throw new Error("trafficSendMessage is required.");
  const id = String(threadID);

  const rates = getGlobalSettings(); // set from the dashboard
  const message = humanize(text, {
    abbreviations: BANAT_SHORTHANDS,
    abbreviationRate: rates.shorthandRate,
    typoRate: rates.typoRate,
  });

  const recentMessages = trackActivity(id);
  const mode = recentMessages >= 5 ? "rushed" : recentMessages <= 1 ? "chill" : "normal";
  const delay = calculateHumanDelay(message, {
    incomingText: options.incomingText || "",
    recentMessages,
    momentum: Math.max(0, recentMessages - 1),
    mode,
  }, { hesitationRate: rates.hesitationRate });

  const reactionMs = Number.isFinite(Number(options.replyDelayMs)) && options.replyDelayMs !== null && options.replyDelayMs !== undefined
    ? Math.max(0, Number(options.replyDelayMs))
    : delay.reactionMs;
  if (reactionMs) await sleep(reactionMs);

  const deliver = () => new Promise(resolve => {
    try {
      send(api, message, id, (error, info) => resolve(error ? false : (info || true)), replyToMessageID || null);
    } catch (error) {
      console.error("[BANAT] send threw:", error?.message || error);
      resolve(false);
    }
  });

  if (options.typingEnabled === false) return deliver();
  return withTyping(api, id, delay.typingMs, deliver);
}

module.exports = { sendBanatReplyWithTyping };
