import fs from "node:fs/promises";
import path from "node:path";
import { gitDiff, gitStatus, getHead, getCurrentBranch } from "./git";

/** Context Engine (plan §23–§33). The system owns context, not the agent. */

export function agentManagerDir(root: string): string {
  return path.join(root, ".agent-manager");
}

export function taskDir(root: string, taskId: string): string {
  return path.join(agentManagerDir(root), "tasks", taskId);
}

export async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

async function writeIfMissing(filePath: string, content: string) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content);
  }
}

export interface TaskContextInit {
  id: string;
  title: string;
  description: string;
  mode: string;
  preferredAgent?: string | null;
}

export async function initTaskContext(root: string, task: TaskContextInit): Promise<void> {
  const dir = taskDir(root, task.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(dir, "checkpoints"), { recursive: true });

  await writeIfMissing(
    path.join(dir, "task.md"),
    `# ${task.id}\n\n${task.title}\n\n## Mô tả\n\n${task.description || "(chưa có mô tả)"}\n\n## Chế độ\n\n${task.mode}\n`,
  );
  await writeIfMissing(
    path.join(dir, "context.md"),
    `# Ngữ cảnh kỹ thuật\n\nKiến trúc, ràng buộc kỹ thuật quan trọng cho task này.\n`,
  );
  await writeIfMissing(path.join(dir, "progress.md"), `# Tiến độ\n\n(chưa có)\n`);
  await writeIfMissing(path.join(dir, "todo.md"), `# Việc còn lại\n\n- ${task.title}\n`);
  await writeIfMissing(path.join(dir, "decisions.md"), `# Quyết định kỹ thuật\n\n(chưa có quyết định nào)\n`);
  await writeIfMissing(path.join(dir, "files-touched.json"), JSON.stringify([], null, 2));
  await writeIfMissing(path.join(dir, "git-state.json"), JSON.stringify({}, null, 2));
  await writeIfMissing(path.join(dir, "sessions.json"), JSON.stringify({}, null, 2));
  await writeIfMissing(path.join(dir, "terminal-history.log"), "");
  await writeIfMissing(path.join(dir, "test-results.log"), "");
}

async function appendLine(filePath: string, line: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, line.endsWith("\n") ? line : `${line}\n`);
}

export async function appendProgress(root: string, taskId: string, line: string) {
  await appendLine(path.join(taskDir(root, taskId), "progress.md"), `- [${new Date().toISOString()}] ${line}`);
}

export async function setTodo(root: string, taskId: string, items: string[]) {
  const content = `# Việc còn lại\n\n${items.length ? items.map((i) => `- ${i}`).join("\n") : "(không còn việc nào)"}\n`;
  await fs.writeFile(path.join(taskDir(root, taskId), "todo.md"), content);
}

export async function readTodo(root: string, taskId: string): Promise<string[]> {
  const content = await readFileSafe(path.join(taskDir(root, taskId), "todo.md"));
  return content
    .split("\n")
    .filter((line) => line.trim().startsWith("- "))
    .map((line) => line.trim().slice(2))
    .filter((line) => line !== "(không còn việc nào)");
}

export async function appendDecision(root: string, taskId: string, decision: string, reason: string) {
  await appendLine(
    path.join(taskDir(root, taskId), "decisions.md"),
    `\n## ${new Date().toISOString()}\n\nDecision: ${decision}\n\nReason: ${reason}\n`,
  );
}

export async function recordFilesTouched(root: string, taskId: string, files: string[]) {
  const filePath = path.join(taskDir(root, taskId), "files-touched.json");
  let existing: string[] = [];
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf-8")) as string[];
  } catch {
    existing = [];
  }
  const merged = Array.from(new Set([...existing, ...files]));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2));
  return merged;
}

export async function readFilesTouched(root: string, taskId: string): Promise<string[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(taskDir(root, taskId), "files-touched.json"), "utf-8")) as string[];
  } catch {
    return [];
  }
}

export async function syncGitState(root: string, taskId: string) {
  const branch = await getCurrentBranch(root);
  const head = await getHead(root);
  const status = await gitStatus(root);
  const state = { branch, head, dirty: status.dirty, files: status.files.map((f) => f.path) };
  await fs.mkdir(taskDir(root, taskId), { recursive: true });
  await fs.writeFile(path.join(taskDir(root, taskId), "git-state.json"), JSON.stringify(state, null, 2));
  return state;
}

export async function appendTerminalHistory(root: string, taskId: string, entry: string) {
  await appendLine(path.join(taskDir(root, taskId), "terminal-history.log"), `[${new Date().toISOString()}] ${entry}`);
}

export async function readTerminalHistory(root: string, taskId: string, limit = 20): Promise<string[]> {
  const content = await readFileSafe(path.join(taskDir(root, taskId), "terminal-history.log"));
  return content.trim().split("\n").filter(Boolean).slice(-limit);
}

export async function recordTestResult(root: string, taskId: string, result: string) {
  await appendLine(path.join(taskDir(root, taskId), "test-results.log"), `[${new Date().toISOString()}] ${result}`);
}

export async function readLastTestResult(root: string, taskId: string): Promise<string | null> {
  const content = await readFileSafe(path.join(taskDir(root, taskId), "test-results.log"));
  const lines = content.trim().split("\n").filter(Boolean);
  return lines.length ? lines[lines.length - 1] : null;
}

export async function recordSession(root: string, taskId: string, agent: string, sessionId: string) {
  const filePath = path.join(taskDir(root, taskId), "sessions.json");
  let existing: Record<string, string> = {};
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf-8")) as Record<string, string>;
  } catch {
    existing = {};
  }
  existing[agent] = sessionId;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2));
}

export async function readSessions(root: string, taskId: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(path.join(taskDir(root, taskId), "sessions.json"), "utf-8")) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

export interface ContextPackage {
  taskSummary: string;
  architectureContext: string;
  progress: string;
  todo: string;
  decisions: string;
  filesTouched: string[];
  gitState: { branch: string | null; head: string | null; dirty: boolean };
  gitDiff: string;
  testResult: string | null;
  recentCommands: string[];
}

/** Keeps only the last N lines of a section — plan §33 context compaction. */
export function compactSection(content: string, maxLines: number, maxChars = 4000): string {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const tail = lines.slice(-maxLines).join("\n");
  if (tail.length <= maxChars) return tail;
  return `...(đã rút gọn)...\n${tail.slice(tail.length - maxChars)}`;
}

const MAX_DIFF_CHARS = 12_000;

/**
 * Builds the compacted Context Package (plan §33).
 * Old logs stay on disk/DB but are never injected wholesale.
 */
export async function buildContextPackage(root: string, taskId: string): Promise<ContextPackage> {
  const dir = taskDir(root, taskId);
  const [taskMd, architectureContext, progress, todo, decisions, filesTouched] = await Promise.all([
    readFileSafe(path.join(dir, "task.md")),
    readFileSafe(path.join(dir, "context.md")),
    readFileSafe(path.join(dir, "progress.md")),
    readFileSafe(path.join(dir, "todo.md")),
    readFileSafe(path.join(dir, "decisions.md")),
    readFilesTouched(root, taskId),
  ]);

  const status = await gitStatus(root);
  const head = await getHead(root);

  let diff = filesTouched.length
    ? (await Promise.all(filesTouched.slice(0, 20).map((file) => gitDiff(root, file)))).filter(Boolean).join("\n")
    : await gitDiff(root);
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n...(diff đã được rút gọn)...`;
  }

  return {
    taskSummary: taskMd.trim(),
    architectureContext: compactSection(architectureContext, 40),
    progress: compactSection(progress, 25),
    todo: compactSection(todo, 30),
    decisions: compactSection(decisions, 40),
    filesTouched,
    gitState: { branch: status.branch, head, dirty: status.dirty },
    gitDiff: diff,
    testResult: await readLastTestResult(root, taskId),
    recentCommands: await readTerminalHistory(root, taskId, 10),
  };
}

/** Handoff prompt (plan §31) — the literal contract handed to the next agent. */
export function buildHandoffPrompt(taskId: string, pkg: ContextPackage): string {
  const base = `.agent-manager/tasks/${taskId}`;
  return `Bạn đang tiếp quản một công việc đang được thực hiện dở.

TASK:
${taskId}

Đọc trước:

${base}/task.md
${base}/context.md
${base}/progress.md
${base}/decisions.md
${base}/todo.md

Repository:

Branch:
${pkg.gitState.branch ?? "(không xác định)"}

HEAD:
${pkg.gitState.head ?? "(không xác định)"}

File thay đổi:
${pkg.filesTouched.length ? pkg.filesTouched.join("\n") : "(chưa có)"}

Đã hoàn thành:
${pkg.progress || "(chưa có)"}

Việc còn lại:
${pkg.todo || "(chưa có)"}

Quyết định kỹ thuật đã chốt:
${pkg.decisions || "(chưa có)"}

Kết quả kiểm thử gần nhất:
${pkg.testResult ?? "(chưa có kết quả)"}

Không thực hiện lại phần đã hoàn thành.

Trước khi sửa source:

1. Đọc context.
2. Kiểm tra git status.
3. Kiểm tra git diff.

Tiếp tục công việc đầu tiên chưa hoàn thành trong todo.md.

Trước khi dừng:

- cập nhật progress.md
- cập nhật todo.md
- cập nhật decisions.md nếu có quyết định mới
- chạy test liên quan
`;
}

/** Prompt for a fresh task (no prior agent). */
export function buildInitialPrompt(taskId: string, title: string, description: string, mode: string): string {
  const base = `.agent-manager/tasks/${taskId}`;
  return `Bạn là AI Coding Agent đang làm việc trong repository này.

TASK:
${taskId}

Tiêu đề:
${title}

Mô tả:
${description || "(không có mô tả chi tiết)"}

Chế độ làm việc:
${mode}

Ghi chú context của hệ thống nằm tại:
${base}/

Yêu cầu:

1. Đọc ${base}/task.md và ${base}/todo.md trước khi sửa code.
2. Kiểm tra git status và git diff trước khi thay đổi.
3. Thực hiện công việc trong todo.md.
4. Chạy test liên quan.

Trước khi dừng:

- cập nhật ${base}/progress.md
- cập nhật ${base}/todo.md
- cập nhật ${base}/decisions.md nếu có quyết định kỹ thuật mới
`;
}
