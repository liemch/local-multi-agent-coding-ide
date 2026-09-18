import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agentManagerDir,
  appendDecision,
  appendProgress,
  appendTerminalHistory,
  buildHandoffPrompt,
  buildInitialPrompt,
  compactSection,
  initTaskContext,
  readFilesTouched,
  readSessions,
  readTerminalHistory,
  readTodo,
  recordFilesTouched,
  recordSession,
  recordTestResult,
  readLastTestResult,
  setTodo,
  taskDir,
} from "@/lib/context";

let root = "";
const TASK_ID = "TASK-001";

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ide-context-"));
  await initTaskContext(root, {
    id: TASK_ID,
    title: "Thêm API /health",
    description: "Tạo endpoint GET /health trả về trạng thái.",
    mode: "implement",
  });
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("shared context layout (plan §30)", () => {
  it("creates .agent-manager/tasks/TASK-xxx with the required files", async () => {
    const dir = taskDir(root, TASK_ID);
    expect(dir).toBe(path.join(agentManagerDir(root), "tasks", TASK_ID));
    for (const file of ["task.md", "context.md", "progress.md", "todo.md", "decisions.md"]) {
      await expect(fs.access(path.join(dir, file))).resolves.toBeUndefined();
    }
  });

  it("writes the task title into task.md", async () => {
    const content = await fs.readFile(path.join(taskDir(root, TASK_ID), "task.md"), "utf8");
    expect(content).toContain("Thêm API /health");
  });
});

describe("progress / todo / decisions", () => {
  it("appends progress lines", async () => {
    await appendProgress(root, TASK_ID, "Đã tạo route handler");
    const content = await fs.readFile(path.join(taskDir(root, TASK_ID), "progress.md"), "utf8");
    expect(content).toContain("Đã tạo route handler");
  });

  it("round-trips the todo list", async () => {
    await setTodo(root, TASK_ID, ["Viết test", "Cập nhật README"]);
    const todo = await readTodo(root, TASK_ID);
    expect(todo).toEqual(["Viết test", "Cập nhật README"]);
  });

  it("records decisions with their reason", async () => {
    await appendDecision(root, TASK_ID, "Dùng SQLite", "Không cần native toolchain");
    const content = await fs.readFile(path.join(taskDir(root, TASK_ID), "decisions.md"), "utf8");
    expect(content).toContain("Dùng SQLite");
    expect(content).toContain("Không cần native toolchain");
  });
});

describe("files touched", () => {
  it("accumulates and deduplicates", async () => {
    await recordFilesTouched(root, TASK_ID, ["src/a.ts", "src/b.ts"]);
    await recordFilesTouched(root, TASK_ID, ["src/b.ts", "src/c.ts"]);
    const files = await readFilesTouched(root, TASK_ID);
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });
});

describe("terminal history and test results", () => {
  it("keeps recent commands", async () => {
    await appendTerminalHistory(root, TASK_ID, "npm test");
    await appendTerminalHistory(root, TASK_ID, "git status");
    const history = await readTerminalHistory(root, TASK_ID, 5);
    expect(history).toHaveLength(2);
    expect(history.some((line) => line.includes("git status"))).toBe(true);
    // entries are timestamped so they can be replayed in order
    expect(history[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
  });

  it("stores the last real test result", async () => {
    await recordTestResult(root, TASK_ID, "PASS 12 tests");
    expect(await readLastTestResult(root, TASK_ID)).toContain("PASS 12 tests");
  });

  it("returns null when no test has actually run (never fabricated)", async () => {
    expect(await readLastTestResult(root, "TASK-999")).toBeNull();
  });
});

describe("session ids for resume", () => {
  it("stores one session id per agent", async () => {
    await recordSession(root, TASK_ID, "codex", "sess-codex-1");
    await recordSession(root, TASK_ID, "claude", "sess-claude-1");
    const sessions = await readSessions(root, TASK_ID);
    expect(sessions.codex).toBe("sess-codex-1");
    expect(sessions.claude).toBe("sess-claude-1");
  });
});

describe("compactSection (plan §33)", () => {
  it("keeps only the newest lines", () => {
    const input = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const compacted = compactSection(input, 10);
    expect(compacted.split("\n")).toHaveLength(10);
    expect(compacted).toContain("line 99");
    expect(compacted).not.toContain("line 0\n");
  });

  it("truncates when the character budget is exceeded", () => {
    const input = Array.from({ length: 50 }, () => "x".repeat(200)).join("\n");
    const compacted = compactSection(input, 50, 500);
    expect(compacted.length).toBeLessThan(700);
    expect(compacted).toContain("rút gọn");
  });
});

describe("prompts", () => {
  it("initial prompt carries task id, title and context paths", () => {
    const prompt = buildInitialPrompt(TASK_ID, "Thêm API /health", "Mô tả", "implement");
    expect(prompt).toContain(TASK_ID);
    expect(prompt).toContain("Thêm API /health");
    expect(prompt).toContain(`.agent-manager/tasks/${TASK_ID}`);
  });

  it("handoff prompt tells the next agent not to redo finished work (plan §31)", () => {
    const prompt = buildHandoffPrompt(TASK_ID, {
      taskSummary: "s",
      architectureContext: "a",
      progress: "Đã xong bước 1",
      todo: "Bước 2",
      decisions: "d",
      filesTouched: ["src/a.ts"],
      gitState: { branch: "main", head: "abc1234", dirty: true },
      gitDiff: "",
      testResult: "PASS",
      recentCommands: [],
    });
    expect(prompt).toContain("Không thực hiện lại phần đã hoàn thành");
    expect(prompt).toContain("Đã xong bước 1");
    expect(prompt).toContain("src/a.ts");
    expect(prompt).toContain("abc1234");
  });
});
