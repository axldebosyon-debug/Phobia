"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phobia-"));
process.env.DATA_DIR = dir;
process.env.SESSION_SECRET = "a-long-test-secret-value";
delete process.env.DATABASE_URL; delete process.env.ECLIPSE_LICENSE_DATABASE_URL; delete process.env.PHOBIA_DATABASE_URL;
process.env.PHOBIA_PASSWORD = "correct horse";

test("session is encrypted on disk and restored after a restart", async () => {
  let store = require("../session-store");
  store.save("c_user=100012345678; xs=secretvalue; datr=abc");
  await store.close();
  const raw = fs.readFileSync(path.join(dir, "session.enc"), "utf8");
  assert.ok(!raw.includes("secretvalue") && !raw.includes("c_user"));
  delete require.cache[require.resolve("../session-store")];
  store = require("../session-store");
  assert.strictEqual(store.read(), null);
  await store.init();
  assert.match(store.read(), /xs=secretvalue/);
  assert.strictEqual(store.status().survivesRestart, true);
  store.clear(); await store.close();
  assert.ok(!fs.existsSync(path.join(dir, "session.enc")));
});

test("session rejects input without c_user", () => {
  const store = require("../session-store");
  assert.throws(() => store.save("xs=1"));
  assert.throws(() => store.save("[{\"key\":\"xs\",\"value\":\"1\"}]"));
  assert.doesNotThrow(() => store.normalizeSessionInput('[{"key":"c_user","value":"1"}]'));
});

test("dashboard token: login, verify, logout, wrong password", () => {
  const auth = require("../phobia-auth");
  const req = headers => ({ headers, socket: { remoteAddress: "1.2.3.4" } });
  assert.strictEqual(auth.login(req({}), "nope").ok, false);
  const ok = auth.login(req({}), "correct horse");
  assert.ok(ok.ok);
  const authed = req({ "x-phobia-token": ok.token });
  assert.strictEqual(auth.isAuthed(authed), true);
  assert.strictEqual(auth.isAuthed(req({ "x-phobia-token": ok.token + "00" })), false);
  auth.logout(authed);
  assert.strictEqual(auth.isAuthed(authed), false);
});

test("admin ids: env + stored, numeric only", () => {
  process.env.BOT_ADMIN_IDS = "111111111";
  const admin = require("../admin-access");
  assert.strictEqual(admin.isBotAdmin("111111111"), true);
  assert.strictEqual(admin.isBotAdmin("999999999"), false);
  assert.deepStrictEqual(admin.setStoredAdminIds("222222222, 333333333"), ["222222222", "333333333"]);
  assert.strictEqual(admin.isBotAdmin("333333333"), true);
  assert.throws(() => admin.setStoredAdminIds("John Doe"));
});

test("banat memory avoids recent repeats", () => {
  const m = require("../banat-memory");
  const list = ["a", "b", "c"];
  m.rememberBanatReply("t", "a"); m.rememberBanatReply("t", "b");
  for (let i = 0; i < 20; i++) assert.strictEqual(m.pickBanatReply("t", list), "c");
  m.rememberBanatReply("t", "c");
  assert.strictEqual(m.pickBanatReply("t", list), null);
});

test("banat-human sends once through the traffic queue", async () => {
  process.env.TYPING_ENABLED = "false";
  const { sendBanatReplyWithTyping } = require("../banat-human");
  const sent = [];
  const result = await sendBanatReplyWithTyping({}, "ayos lang yan", "42", "mid.1", {
    typingEnabled: false, replyDelayMs: 0,
    trafficSendMessage: (api, text, thread, cb, reply) => { sent.push({ text, thread, reply }); cb(null, { messageID: "x" }); }
  });
  assert.ok(result);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].thread, "42");
  assert.strictEqual(sent[0].reply, "mid.1");
  const failed = await sendBanatReplyWithTyping({}, "hi", "42", null, {
    typingEnabled: false, replyDelayMs: 0, trafficSendMessage: (a, t, th, cb) => cb(new Error("boom"))
  });
  assert.strictEqual(failed, false);
});

test("lazymeta-fca accepts cookie string, appState array and object", async () => {
  // ws3-fca (the transport) is not needed to test the wrapper: stub it.
  const Module = require("module");
  const original = Module._load;
  let seen = null;
  Module._load = function (request, ...rest) {
    if (request === "ws3-fca") return { login: (cookie, options, cb) => { seen = cookie; cb(null, { getAppState: () => [{ key: "c_user" }] }); } };
    return original.call(this, request, ...rest);
  };
  let toCookieString, login;
  try { login = require("../lazymeta-fca"); toCookieString = login.toCookieString; }
  finally { Module._load = original; }
  const api = await login([{ key: "c_user", value: "5" }, { key: "xs", value: "6" }]);
  assert.strictEqual(seen, "c_user=5; xs=6");
  assert.deepStrictEqual(api.lazymeta.getAppState(), [{ key: "c_user" }]);
  assert.strictEqual(toCookieString("c_user=1; xs=2"), "c_user=1; xs=2");
  assert.strictEqual(toCookieString([{ key: "c_user", value: "1" }, { name: "xs", value: "2" }]), "c_user=1; xs=2");
  assert.strictEqual(toCookieString({ appState: [{ key: "c_user", value: "1" }] }), "c_user=1");
  assert.strictEqual(toCookieString('[{"key":"c_user","value":"9"}]'), "c_user=9");
  assert.throws(() => toCookieString({}));
});

test("dashboard bot settings are validated and saved", () => {
  const s = require("../bot-settings");
  const before = s.getGlobalSettings();
  assert.strictEqual(before.commandsEnabled, true);
  const saved = s.updateGlobal({ commandsEnabled: false, defaultOn: true, sendLimit: 99, threadCooldownMs: -5, typoRate: 5, shorthandRate: "x" });
  assert.strictEqual(saved.commandsEnabled, false);
  assert.strictEqual(saved.defaultOn, true);
  assert.strictEqual(saved.sendLimit, 10);
  assert.strictEqual(saved.threadCooldownMs, 0);
  assert.strictEqual(saved.typoRate, 0.5);
  assert.strictEqual(saved.shorthandRate, 0.08);
  assert.strictEqual(s.getSettings().global.commandsEnabled, false);
  s.updateGlobal({ commandsEnabled: true, defaultOn: false });
});
