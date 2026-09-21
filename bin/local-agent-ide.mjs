#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));

function usage() {
  return `local-agent-ide [options]\n\n  --port <number>       Preferred port (default: 3000)\n  --host <address>      Bind address (default: 127.0.0.1)\n  --data-dir <path>     Runtime data directory\n  --no-open             Do not open a browser\n  --version             Print package version\n  --help                Print this help`;
}
function fail(message) { console.error(`local-agent-ide: ${message}`); process.exit(1); }
function value(args, index, flag) { if (!args[index + 1] || args[index + 1].startsWith("--")) fail(`${flag} requires a value`); return args[index + 1]; }
function envBool(value) { return /^(1|true|yes)$/i.test(value || ""); }

export function parseArguments(args) {
  const options = {
    port: Number(process.env.LOCAL_AGENT_IDE_PORT || 3000),
    host: process.env.LOCAL_AGENT_IDE_HOST || "127.0.0.1",
    dataDir: process.env.LOCAL_AGENT_IDE_DATA_DIR,
    open: !envBool(process.env.LOCAL_AGENT_IDE_NO_OPEN),
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") options.help = true;
    else if (arg === "--version") options.version = true;
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--port") options.port = Number(value(args, i++, arg));
    else if (arg === "--host") options.host = value(args, i++, arg);
    else if (arg === "--data-dir") options.dataDir = path.resolve(value(args, i++, arg));
    else fail(`unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) fail("port must be an integer from 1 to 65535");
  if (!options.host.trim() || options.host.includes("\0")) fail("host is invalid");
  return options;
}

export function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host }, () => server.close(() => resolve(true)));
  });
}
async function choosePort(preferred, host) {
  for (let port = preferred; port <= Math.min(preferred + 100, 65535); port++) if (await canListen(port, host)) return port;
  fail(`no available port found near ${preferred}`);
}
function openBrowser(url) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
}
function browserUrl(host, port) {
  const browserHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  const formattedHost = browserHost.includes(":") ? `[${browserHost}]` : browserHost;
  return `http://${formattedHost}:${port}`;
}
async function waitUntilReady(url, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return true;
    } catch {
      // The standalone server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
function defaultDataDir() {
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "local-agent-ide");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "local-agent-ide");
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "local-agent-ide");
}

async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) fail(`Node.js >=22.5 is required (found ${process.version})`);
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return console.log(usage());
  if (options.version) return console.log(pkg.version);
  const serverFile = path.join(packageRoot, "dist", "server", "server.js");
  if (!fs.existsSync(serverFile)) fail("packaged server is missing; run npm run package:prepare");
  const port = await choosePort(options.port, options.host);
  const dataDir = options.dataDir || defaultDataDir();
  fs.mkdirSync(path.join(dataDir, "data"), { recursive: true });
  const url = browserUrl(options.host, port);
  if (port !== options.port) console.log(`Port ${options.port} is busy; using ${port} instead.`);
  console.log(`Local Agent IDE: ${url}`);
  console.log(`Database: ${path.join(dataDir, "data", "ide.db")}`);
  console.log("Press Ctrl+C to stop.");
  const child = spawn(process.execPath, [serverFile], {
    cwd: path.dirname(serverFile), stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOSTNAME: options.host, LOCAL_AGENT_IDE_DATA_DIR: dataDir, LOCAL_AGENT_IDE_PACKAGE_ROOT: packageRoot, LOCAL_AGENT_IDE_VERSION: pkg.version },
  });
  let stopping = false;
  const stop = (signal) => { if (stopping) return; stopping = true; child.kill(signal); };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  child.once("spawn", async () => {
    const ready = await waitUntilReady(url);
    if (!ready && !stopping) console.warn("Server started but did not become healthy within 5 seconds.");
    if (ready && options.open && !stopping) openBrowser(url);
  });
  child.once("error", (error) => fail(error.message));
  child.once("exit", (code, signal) => process.exitCode = signal ? 1 : (code ?? 1));
}

main();
