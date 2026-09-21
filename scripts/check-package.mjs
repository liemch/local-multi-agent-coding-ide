#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "bin/local-agent-ide.mjs",
  "dist/server/server.js",
  "dist/server/.next/static",
  "dist/server/public/monaco/vs/loader.js",
  "dist/server/scripts/pty_bridge.py",
  "README.md",
  "LICENSE",
];
for (const entry of required) {
  if (!fs.existsSync(path.join(root, entry))) throw new Error(`Package artifact missing: ${entry}`);
}

const forbiddenNames = /^(?:\.env(?:\..*)?|.*\.(?:db|db-wal|db-shm|log))$/i;
const forbiddenDirectories = new Set([".git", "tests", "coverage"]);
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (forbiddenNames.test(entry.name)) throw new Error(`Forbidden package artifact: ${relative}`);
    if (entry.isDirectory()) {
      if (forbiddenDirectories.has(entry.name) || relative === "dist/server/src") {
        throw new Error(`Development directory leaked into package: ${relative}`);
      }
      inspect(absolute);
    }
  }
}
inspect(path.join(root, "dist"));
for (const nativeImageDependency of ["dist/server/node_modules/sharp", "dist/server/node_modules/@img"]) {
  if (fs.existsSync(path.join(root, nativeImageDependency))) {
    throw new Error(`Platform-specific image dependency leaked into package: ${nativeImageDependency}`);
  }
}

fs.accessSync(path.join(root, "bin/local-agent-ide.mjs"), fs.constants.X_OK);
console.log("Package artifact is complete and contains no known source or runtime data.");
