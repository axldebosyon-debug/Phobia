"use strict";
const { readdirSync, statSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");
const roots = [".", "lazymeta-fca", "test", "scripts"];
let failed = 0;
for (const dir of roots) {
  let names = [];
  try { names = readdirSync(dir).filter(n => n.endsWith(".js") && statSync(join(dir, n)).isFile()); } catch (_) { continue; }
  for (const name of names) {
    const result = spawnSync(process.execPath, ["--check", join(dir, name)], { stdio: "inherit" });
    if (result.status !== 0) failed++;
  }
}
if (failed) { console.error(failed + " file(s) failed the syntax check."); process.exit(1); }
console.log("All files pass the syntax check.");
