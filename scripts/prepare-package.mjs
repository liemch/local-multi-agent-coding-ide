#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const run = (args) => execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });

// A previous dist must not exist while Next traces runtime files. Otherwise the
// standalone build can recursively include the old packaged server, increasing
// every subsequent tarball and potentially leaking stale source artifacts.
fs.rmSync(dist, { recursive: true, force: true });
run(["scripts/setup-monaco.mjs"]);
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { cwd: root, stdio: "inherit" });
fs.mkdirSync(dist, { recursive: true });
const copy = (from, to, required = true) => {
  if (!fs.existsSync(from)) { if (required) throw new Error(`Missing package input: ${from}`); return; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
};
copy(path.join(root, ".next", "standalone"), path.join(dist, "server"));
// `images.unoptimized` means Sharp is unreachable at runtime. Next tracing still
// includes every native variant; remove them to keep one tarball portable across
// Windows, macOS and Linux and save roughly 45 MB installed.
fs.rmSync(path.join(dist, "server", "node_modules", "sharp"), { recursive: true, force: true });
fs.rmSync(path.join(dist, "server", "node_modules", "@img"), { recursive: true, force: true });
copy(path.join(root, ".next", "static"), path.join(dist, "server", ".next", "static"));
copy(path.join(root, "public"), path.join(dist, "server", "public"));
copy(path.join(root, "scripts", "pty_bridge.py"), path.join(dist, "server", "scripts", "pty_bridge.py"));
console.log("Package runtime prepared in dist/");
