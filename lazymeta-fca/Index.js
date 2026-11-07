"use strict";

/**
 * lazymeta-fca
 * ------------
 * Thin wrapper around ws3-fca (the transport that actually speaks to Messenger).
 * What it adds:
 *   - login() accepts a cookie header string, an appState array, { appState } or { cookies }
 *   - login() works with a callback AND returns a Promise
 *   - the returned api has one consistent set of helpers (see attachHelpers)
 * Everything else on the api is ws3-fca's own and is passed through untouched.
 */

const ws3 = require("ws3-fca");

function toCookieString(input) {
  if (typeof input === "string") {
    const text = input.trim();
    if (text.startsWith("[") || text.startsWith("{")) {
      try { return toCookieString(JSON.parse(text)); } catch (_) { /* fall through */ }
    }
    if (!text) throw new Error("lazymeta-fca: empty session.");
    return text;
  }
  const entries = Array.isArray(input) ? input
    : Array.isArray(input?.appState) ? input.appState
    : Array.isArray(input?.cookies) ? input.cookies
    : null;
  if (!entries) throw new Error("lazymeta-fca: session must be a cookie string, an appState array, or { appState }.");
  const parts = entries.map(c => {
    const key = c?.key ?? c?.name, value = c?.value;
    return key == null || value == null ? null : String(key).trim() + "=" + String(value);
  }).filter(Boolean);
  if (!parts.length) throw new Error("lazymeta-fca: session has no valid cookie entries.");
  return parts.join("; ");
}

function promisify(api, method) {
  return (...args) => new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, res) => { if (settled) return; settled = true; err ? reject(err) : resolve(res); };
    try {
      const out = api[method](...args, done);
      if (out && typeof out.then === "function") out.then(v => done(null, v), done);
    } catch (e) { done(e); }
  });
}

function attachHelpers(api) {
  if (api.__lazymeta) return api;
  Object.defineProperty(api, "__lazymeta", { value: true });
  api.lazymeta = {
    version: "1.0.0",
    // Promise versions of the calls Phobia uses.
    sendMessage: promisify(api, "sendMessage"),
    getThreadInfo: promisify(api, "getThreadInfo"),
    setTitle: promisify(api, "setTitle"),
    changeNickname: promisify(api, "changeNickname"),
    changeGroupImage: promisify(api, "changeGroupImage"),
    // Always returns an appState array, whatever the transport returns.
    getAppState: () => {
      const state = api.getAppState?.();
      return Array.isArray(state) ? state : [];
    }
  };
  return api;
}

function login(credentials, optionsOrCallback, maybeCallback) {
  const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  const options = typeof optionsOrCallback === "object" && optionsOrCallback ? optionsOrCallback : {};

  return new Promise((resolve, reject) => {
    let cookie;
    try { cookie = toCookieString(credentials); }
    catch (error) { if (callback) callback(error); return reject(error); }

    let settled = false;
    const finish = (error, api) => {
      if (settled) return;
      settled = true;
      if (error || !api) {
        const failure = error || new Error("lazymeta-fca: login returned no api.");
        if (callback) callback(failure);
        return reject(failure);
      }
      attachHelpers(api);
      if (callback) callback(null, api);
      resolve(api);
    };
    try {
      const out = ws3.login(cookie, options, finish);
      if (out && typeof out.then === "function") out.then(api => finish(null, api), finish);
    } catch (error) { finish(error); }
  });
}

module.exports = login;
module.exports.login = login;
module.exports.default = login;
module.exports.toCookieString = toCookieString;
