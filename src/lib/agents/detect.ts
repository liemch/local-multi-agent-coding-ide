import { execFile } from "node:child_process";
import type { AgentHealth } from "./types";

export function runCommand(
  cmd: string,
  args: string[],
  opts: { timeout?: number; cwd?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeout ?? 5000, cwd: opts.cwd, maxBuffer: 1024 * 1024 * 8 },
      (error, stdout, stderr) => {
        const code =
          error && "code" in error && typeof (error as { code?: number }).code === "number"
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({ code, stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" });
      },
    );
  });
}

const detectionCache = new Map<string, { value: string | null; at: number }>();
const CACHE_TTL = 30_000;

export async function findBinaryPath(bin: string): Promise<string | null> {
  const cached = detectionCache.get(bin);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;

  const finder = process.platform === "win32" ? "where" : "which";
  const res = await runCommand(finder, [bin]);
  const value = res.code === 0 && res.stdout.trim() ? res.stdout.trim().split("\n")[0].trim() : null;
  detectionCache.set(bin, { value, at: Date.now() });
  return value;
}

export function clearDetectionCache() {
  detectionCache.clear();
}

/** Shared detection used by all adapters: resolve binary, then ask for --version. */
export async function detectBinary(bin: string): Promise<AgentHealth> {
  const binaryPath = await findBinaryPath(bin);
  if (!binaryPath) {
    return { installed: false, status: "unavailable", version: null, binaryPath: null };
  }
  const res = await runCommand(bin, ["--version"], { timeout: 8000 });
  const version = (res.stdout.trim() || res.stderr.trim() || null)?.split("\n")[0] ?? null;
  return { installed: true, status: "available", version, binaryPath };
}
