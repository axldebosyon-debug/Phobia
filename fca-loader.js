"use strict";

/**
 * FCA adapter for Phobia.
 *
 * Pick the Messenger library with the FCA_PACKAGE environment variable, e.g.
 *   FCA_PACKAGE=<your-lazymeta-fca-package-name>
 * If it is not set, the bundled lazymeta-fca is used (ws3-fca is the fallback if it is missing).
 *
 * The adapter hides the differences between FCA forks:
 *   - session format: ws3-fca takes a cookie string, standard forks take { appState: [...] }
 *   - typing indicator: ws3-fca uses (active, threadID, cb), standard forks use (threadID, cb) -> stopFn
 * Override with FCA_SESSION_FORMAT=cookie|appstate and FCA_TYPING_STYLE=ws3|legacy if auto-detection is wrong.
 */

const DEFAULT_PACKAGE = "lazymeta-fca";
const packageName = String(process.env.FCA_PACKAGE || DEFAULT_PACKAGE).trim() || DEFAULT_PACKAGE;
const isWs3 = /(^|\/)(ws3-fca|lazymeta-fca)$/i.test(packageName);

function pickMode(envName, allowed, fallback) {
  const value = String(process.env[envName] || "auto").trim().toLowerCase();
  return allowed.includes(value) ? value : fallback;
}

const sessionFormat = pickMode("FCA_SESSION_FORMAT", ["cookie", "appstate"], isWs3 ? "cookie" : "appstate");
const typingStyle = pickMode("FCA_TYPING_STYLE", ["ws3", "legacy"], isWs3 ? "ws3" : "legacy");

let cachedLogin = null;

function getLogin() {
  if (cachedLogin) return cachedLogin;
  let mod;
  try {
    try { mod = require(packageName); }
    catch (first) {
      if (process.env.FCA_PACKAGE || packageName === "ws3-fca") throw first;
      mod = require("ws3-fca"); // default lazymeta-fca not installed: fall back
    }
  } catch (error) {
    throw new Error(
      "Cannot load FCA package \"" + packageName + "\". Install it (npm i " + packageName + ") " +
      "and make sure FCA_PACKAGE is spelled exactly like the package name. " + (error && error.message || error)
    );
  }
  const fn = typeof mod === "function" ? mod
    : typeof mod?.login === "function" ? mod.login
    : typeof mod?.default === "function" ? mod.default
    : typeof mod?.default?.login === "function" ? mod.default.login
    : null;
  if (!fn) throw new Error("FCA package \"" + packageName + "\" does not export a login function.");
  cachedLogin = fn;
  return fn;
}

function cookieStringToAppState(cookie) {
  const now = new Date().toISOString();
  return String(cookie).split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf("=");
    if (index <= 0) return null;
    return {
      key: part.slice(0, index).trim(),
      value: part.slice(index + 1).trim(),
      domain: "facebook.com",
      path: "/",
      hostOnly: false,
      creation: now,
      lastAccessed: now
    };
  }).filter(Boolean);
}

// Receives the normalized cookie-header string used by index.js and returns
// whatever the selected FCA expects as its first login() argument.
function prepareSession(cookie) {
  if (sessionFormat === "cookie") return cookie;
  const appState = cookieStringToAppState(cookie);
  if (!appState.length) throw new Error("Facebook session contains no valid cookie entries.");
  return { appState };
}

function login(cookie, callback) {
  return getLogin()(prepareSession(cookie), callback);
}

module.exports = { login, prepareSession, cookieStringToAppState, packageName, sessionFormat, typingStyle };
