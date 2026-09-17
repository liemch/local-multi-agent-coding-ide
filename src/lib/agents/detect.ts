import { execFile } from "node:child_process";
import { AGENT_BINARIES, type AgentHealth, type AgentId } from "./types";

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout, stderr) => {
      const code = error && "code" in error && typeof error.code === "number" ? error.code : error ? 1 : 0;
      resolve({ code, stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" });
    });
  });
}

export async function findBinaryPath(bin: string): Promise<string | null> {
  const finder = process.platform === "win32" ? "where" : "which";
  const res = await run(finder, [bin]);
  if (res.code === 0 && res.stdout.trim()) {
    return res.stdout.trim().split("\n")[0];
  }
  return null;
}

export async function detectAgent(agentId: AgentId): Promise<AgentHealth> {
  const bin = AGENT_BINARIES[agentId];
  const binaryPath = await findBinaryPath(bin);
  if (!binaryPath) {
    return { installed: false, status: "unavailable", version: null, binaryPath: null };
  }
  const versionRes = await run(bin, ["--version"]);
  const version = versionRes.stdout.trim() || versionRes.stderr.trim() || null;
  return {
    installed: true,
    status: "available",
    version,
    binaryPath,
  };
}

export async function detectAllAgents(): Promise<Record<AgentId, AgentHealth>> {
  const [codex, claude, antigravity] = await Promise.all([
    detectAgent("codex"),
    detectAgent("claude"),
    detectAgent("antigravity"),
  ]);
  return { codex, claude, antigravity };
}
