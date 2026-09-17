import { execFile } from "node:child_process";

function run(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, maxBuffer: 1024 * 1024 * 32 }, (error, stdout, stderr) => {
      const code = error && "code" in error && typeof error.code === "number" ? error.code : error ? 1 : 0;
      resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "", code });
    });
  });
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  const res = await run(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return res.code === 0 && res.stdout.trim() === "true";
}

export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const res = await run(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (res.code !== 0) return null;
  return res.stdout.trim() || null;
}

export async function getHead(cwd: string): Promise<string | null> {
  const res = await run(cwd, ["rev-parse", "--short", "HEAD"]);
  if (res.code !== 0) return null;
  return res.stdout.trim() || null;
}

export interface GitFileStatus {
  path: string;
  index: string;
  worktree: string;
  code: "M" | "A" | "D" | "R" | "?" | "U" | " ";
}

export async function gitStatus(cwd: string): Promise<{ branch: string | null; dirty: boolean; files: GitFileStatus[] }> {
  const branch = await getCurrentBranch(cwd);
  const res = await run(cwd, ["status", "--porcelain=v1"]);
  const files: GitFileStatus[] = [];
  for (const line of res.stdout.split("\n")) {
    if (!line.trim()) continue;
    const index = line[0];
    const worktree = line[1];
    const filePath = line.slice(3);
    let code: GitFileStatus["code"] = " ";
    if (index === "?" || worktree === "?") code = "?";
    else if (index === "A") code = "A";
    else if (index === "D" || worktree === "D") code = "D";
    else if (index === "R") code = "R";
    else if (index === "U" || worktree === "U") code = "U";
    else code = "M";
    files.push({ path: filePath, index, worktree, code });
  }
  return { branch, dirty: files.length > 0, files };
}

export async function gitDiff(cwd: string, filePath?: string): Promise<string> {
  const args = ["diff", "HEAD"];
  if (filePath) args.push("--", filePath);
  const res = await run(cwd, args);
  if (res.stdout.trim()) return res.stdout;
  // fall back to unstaged diff if no HEAD yet (empty repo)
  const alt = await run(cwd, filePath ? ["diff", "--", filePath] : ["diff"]);
  return alt.stdout;
}

export async function gitLog(cwd: string, limit = 30): Promise<Array<{ hash: string; author: string; date: string; message: string }>> {
  const res = await run(cwd, ["log", `-${limit}`, "--pretty=format:%h|%an|%ad|%s", "--date=iso-strict"]);
  if (res.code !== 0) return [];
  return res.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...rest] = line.split("|");
      return { hash, author, date, message: rest.join("|") };
    });
}

export async function gitCommit(cwd: string, message: string): Promise<{ ok: boolean; output: string }> {
  await run(cwd, ["add", "-A"]);
  const res = await run(cwd, ["commit", "-m", message]);
  return { ok: res.code === 0, output: res.stdout + res.stderr };
}

export async function gitInit(cwd: string): Promise<void> {
  await run(cwd, ["init"]);
}

export async function gitCreateBranch(cwd: string, name: string): Promise<{ ok: boolean; output: string }> {
  const res = await run(cwd, ["checkout", "-b", name]);
  return { ok: res.code === 0, output: res.stdout + res.stderr };
}
