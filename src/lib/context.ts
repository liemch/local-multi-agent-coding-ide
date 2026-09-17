import fs from "node:fs/promises";
import path from "node:path";
import { gitDiff, gitStatus, getHead, getCurrentBranch } from "./git";

export function agentManagerDir(root: string): string {
  return path.join(root, ".agent-manager");
}

export function taskDir(root: string, taskId: string): string {
  return path.join(agentManagerDir(root), "tasks", taskId);
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
    `# Ngữ cảnh kỹ thuật\n\nCập nhật thông tin kiến trúc, ràng buộc kỹ thuật quan trọng cho task này tại đây.\n`,
  );
  await writeIfMissing(path.join(dir, "progress.md"), `# Tiến độ\n\nĐã hoàn thành:\n\n(chưa có)\n`);
  await writeIfMissing(path.join(dir, "todo.md"), `# Việc còn lại\n\n- Bắt đầu triển khai: ${task.title}\n`);
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
  const stamp = new Date().toISOString();
  await appendLine(path.join(taskDir(root, taskId), "progress.md"), `- [${stamp}] ${line}`);
}

export async function setTodo(root: string, taskId: string, items: string[]) {
  const content = `# Việc còn lại\n\n${items.length ? items.map((i) => `- ${i}`).join("\n") : "(không còn việc nào)"}\n`;
  await fs.writeFile(path.join(taskDir(root, taskId), "todo.md"), content);
}

export async function readTodo(root: string, taskId: string): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(taskDir(root, taskId), "todo.md"), "utf-8");
    return content
      .split("\n")
      .filter((l) => l.trim().startsWith("- "))
      .map((l) => l.trim().slice(2));
  } catch {
    return [];
  }
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
    existing = JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    existing = [];
  }
  const merged = Array.from(new Set([...existing, ...files]));
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2));
  return merged;
}

export async function readFilesTouched(root: string, taskId: string): Promise<string[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(taskDir(root, taskId), "files-touched.json"), "utf-8"));
  } catch {
    return [];
  }
}

export async function syncGitState(root: string, taskId: string) {
  const branch = await getCurrentBranch(root);
  const head = await getHead(root);
  const status = await gitStatus(root);
  const state = { branch, head, dirty: status.dirty, files: status.files.map((f) => f.path) };
  await fs.writeFile(path.join(taskDir(root, taskId), "git-state.json"), JSON.stringify(state, null, 2));
  return state;
}

export async function appendTerminalHistory(root: string, taskId: string, entry: string) {
  await appendLine(path.join(taskDir(root, taskId), "terminal-history.log"), `[${new Date().toISOString()}] ${entry}`);
}

export async function recordTestResult(root: string, taskId: string, result: string) {
  await appendLine(path.join(taskDir(root, taskId), "test-results.log"), `[${new Date().toISOString()}] ${result}`);
}

export async function readLastTestResult(root: string, taskId: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(taskDir(root, taskId), "test-results.log"), "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

export async function recordSession(root: string, taskId: string, agent: string, sessionId: string) {
  const filePath = path.join(taskDir(root, taskId), "sessions.json");
  let existing: Record<string, string> = {};
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    existing = {};
  }
  existing[agent] = sessionId;
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2));
}

export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

export interface ContextPackage {
  taskSummary: string;
  progress: string;
  todo: string;
  decisions: string;
  filesTouched: string[];
  gitState: { branch: string | null; head: string | null; dirty: boolean };
  gitDiff: string;
  testResult: string | null;
  recentCommands: string[];
}

export async function buildContextPackage(root: string, taskId: string): Promise<ContextPackage> {
  const dir = taskDir(root, taskId);
  const [taskMd, progress, todo, decisions, filesTouched] = await Promise.all([
    readFile(path.join(dir, "task.md")),
    readFile(path.join(dir, "progress.md")),
    readFile(path.join(dir, "todo.md")),
    readFile(path.join(dir, "decisions.md")),
    readFilesTouched(root, taskId),
  ]);
  const status = await gitStatus(root);
  const head = await getHead(root);
  const diff = filesTouched.length
    ? (await Promise.all(filesTouched.slice(0, 20).map((f) => gitDiff(root, f)))).join("\n")
    : await gitDiff(root);
  const testResult = await readLastTestResult(root, taskId);
  const historyRaw = await readFile(path.join(dir, "terminal-history.log"));
  const recentCommands = historyRaw.trim().split("\n").filter(Boolean).slice(-10);

  return {
    taskSummary: taskMd,
    progress,
    todo,
    decisions,
    filesTouched,
    gitState: { branch: status.branch, head, dirty: status.dirty },
    gitDiff: diff,
    testResult,
    recentCommands,
  };
}

export function buildHandoffPrompt(taskId: string, pkg: ContextPackage): string {
  return `Bạn đang tiếp quản một công việc đang được thực hiện dở.

TASK:
${taskId}

Đọc trước:

.agent-manager/tasks/${taskId}/task.md
.agent-manager/tasks/${taskId}/context.md
.agent-manager/tasks/${taskId}/progress.md
.agent-manager/tasks/${taskId}/decisions.md
.agent-manager/tasks/${taskId}/todo.md

Repository:

Branch:
${pkg.gitState.branch ?? "(không xác định)"}

HEAD:
${pkg.gitState.head ?? "(không xác định)"}

File thay đổi:
${pkg.filesTouched.length ? pkg.filesTouched.join("\n") : "(chưa có)"}

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
