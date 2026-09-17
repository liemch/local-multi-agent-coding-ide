#!/usr/bin/env node
/**
 * Copies the Monaco editor assets into `public/monaco` so the IDE loads the
 * editor from localhost instead of a CDN (local-first requirement, plan §1).
 * Runs automatically after `npm install`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const target = path.join(root, "public", "monaco", "vs");

if (!fs.existsSync(source)) {
  console.warn("[monaco] node_modules/monaco-editor not found, skipping asset copy.");
  process.exit(0);
}

if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log("[monaco] assets ready at public/monaco/vs");
