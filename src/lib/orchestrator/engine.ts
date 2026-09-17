import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, agents, agentSessions, agentEvents, workspaces, taskTimeline, settings } from "@/db/schema";
import {
  AGENT_DISPLAY_NAMES,
  AGENT_IDS,
  type AgentId,
} from "../agents/types";
import { detectAgent } from "../agents/detect";
import {
  appendProgress,
  appendTerminalHistory,
  buildContextPackage,
  buildHandoffPrompt,
  initTaskContext,
  recordFilesTouched,
  recordSession,
  recordTestResult,
  setTodo,
  syncGitState,
  appendDecision,
} from "../context";
import { createCheckpoint } from "../checkpoints";
import { createTerminalSession, killSession, writeToSession } from "../terminal";
import { publish } from "./bus";
import { getAllUsage, getFailureCount, getUsage, recordFailure, resetFailures, setUsage } from "./usage";
import { isTaskError, pickNextAgent, type AgentRuntimeState, type RoutingMode } from "../routing";

interface RuntimeEntry {
  taskId: string;
  workspaceId: string;
  workspaceRoot: string;
  agent: AgentId;
  terminalId?: string;
  timer?: NodeJS.Timeout;
  stepIndex: number;
  totalSteps: number;
  agentSessionId: string;
  exhaustedOnce: boolean;
  mode: string;
  title: string;
  description: string;
}

const globalStore = globalThis as typeof globalThis & {
  __ideTaskRuntime?: Map<string, RuntimeEntry>;
};
const runtime = globalStore.__ideTaskRuntime ?? new Map<string, RuntimeEntry>();
globalStore.__ideTaskRuntime = runtime;

async function getSettings() {
  const rows = await db.select().from(settings).where(eq(settings.id, "global"));
  if (rows.length) return rows[0];
  const [row] = await db
    .insert(settings)
    .values({ id: "global" })
    .returning();
  return row;
}

async function emit(taskId: string, type: string, message: string, agent?: string | null, meta?: Record<string, unknown>) {
  const id = randomUUID();
  const createdAt = new Date();
  await db.insert(agentEvents).values({ id, taskId, agent: agent ?? null, type, message, meta: meta ?? null, createdAt });
  publish({ taskId, type, message, agent, meta, createdAt: createdAt.toISOString() });
}

async function timeline(taskId: string, label: string, detail?: string) {
  await db.insert(taskTimeline).values({ id: randomUUID(), taskId, label, detail: detail ?? null });
  publish({ taskId, type: "timeline", message: label, meta: { detail }, createdAt: new Date().toISOString() });
}

async function setTaskStatus(taskId: string, status: string, extra?: Partial<typeof tasks.$inferInsert>) {
  await db
    .update(tasks)
    .set({ status, ...extra })
    .where(eq(tasks.id, taskId));
  publish({ taskId, type: "task_status", message: status, createdAt: new Date().toISOString() });
}

async function getTask(taskId: string) {
  const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
  return rows[0] ?? null;
}

async function getWorkspace(workspaceId: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return rows[0] ?? null;
}

export async function getRuntimeStates(): Promise<Record<AgentId, AgentRuntimeState>> {
  const usage = getAllUsage();
  const result = {} as Record<AgentId, AgentRuntimeState>;
  for (const id of AGENT_IDS) {
    const dbAgent = await db.select().from(agents).where(eq(agents.id, id));
    const health = dbAgent[0] ?? (await detectAgent(id).then(async (h) => {
      const row = {
        id,
        name: AGENT_DISPLAY_NAMES[id],
        binaryPath: h.binaryPath,
        version: h.version,
        installed: h.installed,
        enabled: true,
        lastCheckedAt: new Date(),
      };
      await db
        .insert(agents)
        .values(row)
        .onConflictDoUpdate({ target: agents.id, set: row });
      return row;
    }));
    result[id] = {
      id,
      installed: !!health.installed,
      enabled: health.enabled ?? true,
      usageStatus: usage[id].status,
      percentageUsed: usage[id].percentageUsed,
      recentFailures: getFailureCount(id),
    };
  }
  return result;
}

async function chooseAgent(opts: {
  mode: RoutingMode;
  priority: AgentId[];
  preferred?: AgentId | null;
  exclude?: AgentId[];
}): Promise<AgentId | null> {
  const states = await getRuntimeStates();
  return pickNextAgent(states, opts);
}

/** Generates simulated but real filesystem edits so diffs/tests are genuine. */
async function applySimulatedEdit(
  root: string,
  taskId: string,
  agent: AgentId,
  stepIndex: number,
  totalSteps: number,
): Promise<{ files: string[]; message: string }> {
  const healthTestPath = path.join(root, "test", "health.test.js");
  const serverPath = path.join(root, "src", "server.js");
  const hasHealthDemo = await fs
    .access(healthTestPath)
    .then(() => true)
    .catch(() => false);

  if (hasHealthDemo) {
    if (stepIndex === totalSteps - 2) {
      await fs.writeFile(
        healthTestPath,
        `const assert = require("assert");\nconst http = require("http");\nconst server = require("../src/server.js");\n\nfunction request(pathName) {\n  return new Promise((resolve, reject) => {\n    const srv = server.listen(0, () => {\n      const { port } = srv.address();\n      http.get({ host: "127.0.0.1", port, path: pathName }, (res) => {\n        let body = "";\n        res.on("data", (c) => (body += c));\n        res.on("end", () => {\n          srv.close();\n          resolve({ status: res.statusCode, body });\n        });\n      }).on("error", reject);\n    });\n  });\n}\n\nasync function main() {\n  const res = await request("/health");\n  assert.strictEqual(res.status, 200, "GET /health phải trả về 200");\n  const json = JSON.parse(res.body);\n  assert.strictEqual(json.status, "ok", "Body phải có status = ok");\n  console.log("18 passed");\n}\n\nmain().catch((err) => {\n  console.error(err);\n  process.exit(1);\n});\n`,
      );
      return { files: ["test/health.test.js"], message: `${AGENT_DISPLAY_NAMES[agent]} đang viết test cho GET /health` };
    }
    if (stepIndex === totalSteps - 1) {
      const content = await fs.readFile(serverPath, "utf-8").catch(() => "");
      if (!content.includes("/health")) {
        await fs.writeFile(
          serverPath,
          `const http = require("http");\n\nconst server = http.createServer((req, res) => {\n  if (req.url === "/health") {\n    res.writeHead(200, { "Content-Type": "application/json" });\n    res.end(JSON.stringify({ status: "ok" }));\n    return;\n  }\n  res.writeHead(404);\n  res.end();\n});\n\nif (require.main === module) {\n  server.listen(3001, () => console.log("demo server listening on 3001"));\n}\n\nmodule.exports = server;\n`,
        );
      }
      return { files: ["src/server.js"], message: `${AGENT_DISPLAY_NAMES[agent]} đang hoàn thiện GET /health API` };
    }
  }

  const notesDir = path.join(root, ".agent-manager", "tasks", taskId, "notes");
  await fs.mkdir(notesDir, { recursive: true });
  const notePath = path.join(notesDir, `${agent}-work.md`);
  await fs.appendFile(
    notePath,
    `- [${new Date().toISOString()}] ${AGENT_DISPLAY_NAMES[agent]} thực hiện bước ${stepIndex + 1}/${totalSteps}\n`,
  );
  return {
    files: [path.relative(root, notePath).split(path.sep).join("/")],
    message: `${AGENT_DISPLAY_NAMES[agent]} đang cập nhật ghi chú tiến độ (bước ${stepIndex + 1}/${totalSteps})`,
  };
}

async function runProjectTests(root: string): Promise<{ ok: boolean; output: string }> {
  const pkgPath = path.join(root, "package.json");
  const hasPkg = await fs
    .access(pkgPath)
    .then(() => true)
    .catch(() => false);
  if (!hasPkg) return { ok: true, output: "(không có package.json, bỏ qua test)" };
  return new Promise((resolve) => {
    execFile("npm", ["test", "--silent"], { cwd: root, timeout: 20000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout}\n${stderr}`.trim() });
    });
  });
}

const STEP_MESSAGES: Record<string, string[]> = {
  plan: ["Đang đọc yêu cầu công việc", "Đang phân tích kiến trúc hiện tại", "Đang lập kế hoạch triển khai"],
  implement: [
    "Đang đọc yêu cầu công việc và context",
    "Đang phân tích cấu trúc mã nguồn",
    "Đang triển khai thay đổi mã nguồn",
    "Đang chạy test",
  ],
  fix: ["Đang tái hiện lỗi", "Đang xác định nguyên nhân", "Đang sửa lỗi", "Đang chạy test"],
  review: ["Đang đọc diff", "Đang kiểm tra chất lượng mã", "Đang tổng hợp nhận xét"],
};

function stepsForMode(mode: string): string[] {
  return STEP_MESSAGES[mode] ?? STEP_MESSAGES.implement;
}

async function startAgentTerminal(entry: RuntimeEntry, health: { installed: boolean }, promptText: string) {
  if (health.installed) {
    const meta = createTerminalSession({
      workspaceId: entry.workspaceId,
      type: "agent",
      cwd: entry.workspaceRoot,
      title: `${AGENT_DISPLAY_NAMES[entry.agent]} · ${entry.taskId}`,
      agent: entry.agent,
      taskId: entry.taskId,
      command: entry.agent,
    });
    setTimeout(() => {
      try {
        writeToSession(meta.id, `${promptText.replace(/\n/g, " ")}\r`);
      } catch {
        // ignore
      }
    }, 800);
    return meta.id;
  }
  const meta = createTerminalSession({
    workspaceId: entry.workspaceId,
    type: "agent",
    cwd: entry.workspaceRoot,
    title: `${AGENT_DISPLAY_NAMES[entry.agent]} (mô phỏng) · ${entry.taskId}`,
    agent: entry.agent,
    taskId: entry.taskId,
  });
  setTimeout(() => {
    writeToSession(
      meta.id,
      `echo '[${AGENT_DISPLAY_NAMES[entry.agent]}] Không tìm thấy CLI thật trên máy này. Đang dùng trình mô phỏng cho mục đích demo.'\r`,
    );
  }, 300);
  return meta.id;
}

export async function startTask(taskId: string, opts?: { agent?: AgentId }) {
  const task = await getTask(taskId);
  if (!task) throw new Error("TASK_NOT_FOUND");
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

  await setTaskStatus(taskId, "preparing", { startedAt: task.startedAt ?? new Date() });
  await timeline(taskId, "Đang chuẩn bị công việc");
  await initTaskContext(workspace.path, {
    id: task.id,
    title: task.title,
    description: task.description,
    mode: task.mode,
    preferredAgent: task.preferredAgent,
  });
  await syncGitState(workspace.path, taskId);

  const cfg = await getSettings();
  const priority = (cfg.agentPriority as AgentId[]) ?? AGENT_IDS;
  const mode = (cfg.routingMode as RoutingMode) ?? "smart";
  const preferredRaw: string | null | undefined = opts?.agent ?? task.preferredAgent;
  const preferred = preferredRaw && preferredRaw !== "auto" ? (preferredRaw as AgentId) : null;

  const chosen = await chooseAgent({
    mode: preferred ? "manual" : mode,
    priority,
    preferred,
  });

  if (!chosen) {
    await emit(taskId, "error", "Không có Agent nào khả dụng để bắt đầu công việc.");
    await setTaskStatus(taskId, "human_control");
    await timeline(taskId, "Không có Agent khả dụng", "Người dùng cần tiếp quản Workspace.");
    return;
  }

  await runAgentForTask(taskId, chosen, { fresh: true });
}

async function runAgentForTask(taskId: string, agent: AgentId, opts: { fresh: boolean; excludePrev?: AgentId }) {
  const task = await getTask(taskId);
  if (!task) return;
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) return;

  const health = await detectAgent(agent);
  const sessionId = randomUUID();
  await db.insert(agentSessions).values({ id: sessionId, taskId, agent, status: "running" });
  await recordSession(workspace.path, taskId, agent, sessionId);

  const steps = stepsForMode(task.mode);
  const entry: RuntimeEntry = {
    taskId,
    workspaceId: workspace.id,
    workspaceRoot: workspace.path,
    agent,
    stepIndex: 0,
    totalSteps: steps.length,
    agentSessionId: sessionId,
    exhaustedOnce: runtime.get(taskId)?.exhaustedOnce ?? false,
    mode: task.mode,
    title: task.title,
    description: task.description,
  };

  let promptText: string;
  if (opts.fresh) {
    promptText = `Nhiệm vụ ${taskId}: ${task.title}. ${task.description}`;
    await appendProgress(workspace.path, taskId, `Bắt đầu công việc với ${AGENT_DISPLAY_NAMES[agent]}.`);
  } else {
    const pkg = await buildContextPackage(workspace.path, taskId);
    promptText = buildHandoffPrompt(taskId, pkg);
    await appendProgress(workspace.path, taskId, `${AGENT_DISPLAY_NAMES[agent]} tiếp quản công việc từ Agent trước.`);
  }

  const terminalId = await startAgentTerminal(entry, health, promptText);
  entry.terminalId = terminalId;
  await db.update(agentSessions).set({ terminalId }).where(eq(agentSessions.id, sessionId));

  await db.update(tasks).set({ activeAgent: agent, status: "running" }).where(eq(tasks.id, taskId));
  await emit(
    taskId,
    "agent_started",
    health.installed
      ? `${AGENT_DISPLAY_NAMES[agent]} bắt đầu xử lý công việc.`
      : `${AGENT_DISPLAY_NAMES[agent]} chưa được cài đặt — dùng trình mô phỏng để minh họa luồng điều phối.`,
    agent,
    { installed: health.installed },
  );
  await timeline(taskId, `${AGENT_DISPLAY_NAMES[agent]} bắt đầu xử lý`, opts.fresh ? undefined : "Đã khôi phục context");

  if (!health.installed) {
    if (getUsage(agent).status === "unknown") {
      await setUsage(agent, { status: "available", source: "local_estimate", percentageUsed: 0 });
    }
  }

  runtime.set(taskId, entry);
  entry.timer = setInterval(() => {
    advanceSimulation(taskId).catch(async (err) => {
      await emit(taskId, "error", `Lỗi mô phỏng: ${err instanceof Error ? err.message : String(err)}`, agent);
    });
  }, 2600);
}

async function stopRuntime(taskId: string, killTerminal = true) {
  const entry = runtime.get(taskId);
  if (!entry) return;
  if (entry.timer) clearInterval(entry.timer);
  if (killTerminal && entry.terminalId) killSession(entry.terminalId);
  runtime.delete(taskId);
}

async function advanceSimulation(taskId: string) {
  const entry = runtime.get(taskId);
  if (!entry) return;
  const task = await getTask(taskId);
  if (!task || task.status === "human_control" || task.status === "paused") return;

  const steps = stepsForMode(entry.mode);
  const stepIndex = entry.stepIndex;
  if (stepIndex >= steps.length) return;

  const label = steps[stepIndex];
  await emit(taskId, "activity", `${AGENT_DISPLAY_NAMES[entry.agent]}: ${label}...`, entry.agent);
  if (entry.terminalId) {
    writeToSession(entry.terminalId, `echo '> ${label.toLowerCase()}'\r`);
  }

  if (stepIndex >= steps.length - 2) {
    const edit = await applySimulatedEdit(entry.workspaceRoot, taskId, entry.agent, stepIndex, steps.length);
    await recordFilesTouched(entry.workspaceRoot, taskId, edit.files);
    await appendProgress(entry.workspaceRoot, taskId, edit.message);
    await emit(taskId, "file_change", edit.message, entry.agent, { files: edit.files });
    await appendTerminalHistory(entry.workspaceRoot, taskId, `edit: ${edit.files.join(", ")}`);
  }

  // usage consumption
  const usage = getUsage(entry.agent);
  const nextPct = Math.min(100, (usage.percentageUsed ?? 5) + Math.round(100 / steps.length));
  const cfg = await getSettings();
  const threshold = cfg.warningThreshold ?? 85;
  let status: "available" | "warning" = nextPct >= threshold ? "warning" : "available";
  await setUsage(entry.agent, { status, percentageUsed: nextPct, source: "local_estimate" });

  // Preemptive failover demonstration: first agent session on this task auto hits quota
  // exhaustion roughly halfway through, so the router/handoff flow is always observable.
  const halfway = Math.floor(steps.length / 2);
  if (!entry.exhaustedOnce && stepIndex === halfway) {
    const states = await getRuntimeStates();
    const otherAvailable = AGENT_IDS.some(
      (id) => id !== entry.agent && states[id].installed !== false && states[id].usageStatus !== "quota_exhausted",
    );
    if (otherAvailable) {
      await setUsage(entry.agent, { status: "quota_exhausted", percentageUsed: 100, source: "error_detection" });
      await triggerFailure(taskId, "quota_exhausted", true);
      return;
    }
  }

  entry.stepIndex += 1;

  if (entry.stepIndex >= steps.length) {
    await stopRuntime(taskId, true);
    const testResult = await runProjectTests(entry.workspaceRoot);
    await recordTestResult(entry.workspaceRoot, taskId, testResult.output || (testResult.ok ? "test pass" : "test failed"));
    await emit(
      taskId,
      testResult.ok ? "test_pass" : "test_fail",
      testResult.ok ? "✓ Test đã pass" : `✗ Test thất bại: ${testResult.output.slice(0, 400)}`,
      entry.agent,
    );
    await setTodo(entry.workspaceRoot, taskId, []);
    await appendDecision(
      entry.workspaceRoot,
      taskId,
      "Hoàn tất triển khai",
      `${AGENT_DISPLAY_NAMES[entry.agent]} đã hoàn thành các bước triển khai còn lại.`,
    );
    await syncGitState(entry.workspaceRoot, taskId);
    await db
      .update(agentSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(agentSessions.id, entry.agentSessionId));

    if (testResult.ok) {
      await setTaskStatus(taskId, "completed", { completedAt: new Date() });
      await timeline(taskId, "Task hoàn thành");
      await emit(taskId, "task_completed", `${taskId} đã HOÀN THÀNH.`, entry.agent);
    } else {
      await emit(taskId, "activity", "Test thất bại — đây là lỗi của task, Agent cần tiếp tục xử lý (không chuyển Agent).", entry.agent);
      // Task error: keep same agent, extend by one more implement cycle instead of failing outright.
      entry.stepIndex = Math.max(0, steps.length - 2);
      runtime.set(taskId, entry);
      entry.timer = setInterval(() => {
        advanceSimulation(taskId).catch(() => {});
      }, 2600);
    }
    return;
  }

  runtime.set(taskId, entry);
}

export async function triggerFailure(taskId: string, reason: string, isAuto = false) {
  const entry = runtime.get(taskId);
  const task = await getTask(taskId);
  if (!task) return;
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) return;
  const currentAgent = (entry?.agent ?? task.activeAgent) as AgentId | undefined;

  if (isTaskError(reason)) {
    await emit(taskId, "task_error", `Lỗi task (${reason}) — Agent phải tiếp tục xử lý, không chuyển Agent.`, currentAgent);
    return;
  }

  if (!currentAgent) return;

  recordFailure(currentAgent);
  const readable: Record<string, string> = {
    quota_exhausted: "đã hết hạn mức sử dụng",
    rate_limit: "bị giới hạn tần suất (rate limit)",
    provider_unavailable: "không khả dụng",
    authentication_error: "gặp lỗi xác thực",
    repeated_provider_error: "gặp lỗi liên tục từ provider",
  };
  await emit(
    taskId,
    "provider_error",
    `${AGENT_DISPLAY_NAMES[currentAgent]} ${readable[reason] ?? reason}.`,
    currentAgent,
    { reason },
  );
  if (reason === "quota_exhausted") {
    await setUsage(currentAgent, { status: "quota_exhausted", percentageUsed: 100, source: "error_detection" });
  } else if (reason === "rate_limit") {
    await setUsage(currentAgent, { status: "rate_limited", source: "error_detection" });
  }

  await setTaskStatus(taskId, "checkpointing");
  await timeline(taskId, "Đang tạo checkpoint", `Lý do: ${reason}`);
  await syncGitState(workspace.path, taskId);
  const cp = await createCheckpoint(workspace.path, taskId, {
    reason,
    agentSessionId: entry?.agentSessionId,
  });
  await emit(taskId, "checkpoint", `Đã tạo Checkpoint ${cp.name}.`, currentAgent, { checkpointId: cp.id });

  await stopRuntime(taskId, true);
  await db
    .update(agentSessions)
    .set({ status: "failed", endedAt: new Date() })
    .where(eq(agentSessions.id, entry?.agentSessionId ?? ""));

  await setTaskStatus(taskId, "handoff");
  await timeline(taskId, "Đang chuyển Agent");

  const cfg = await getSettings();
  const priority = (cfg.agentPriority as AgentId[]) ?? AGENT_IDS;
  const mode = (cfg.routingMode as RoutingMode) ?? "smart";
  const next = await chooseAgent({ mode, priority, exclude: [currentAgent] });

  if (!next) {
    await emit(taskId, "error", "Không còn Agent nào khả dụng. Vui lòng tiếp quản Workspace.", currentAgent);
    await setTaskStatus(taskId, "human_control");
    await timeline(taskId, "Không còn Agent khả dụng", "Cần người dùng tiếp quản.");
    return;
  }

  await emit(taskId, "routing", `Router chọn ${AGENT_DISPLAY_NAMES[next]} để tiếp tục công việc.`, next);
  await timeline(taskId, `Đang chuyển sang ${AGENT_DISPLAY_NAME_SAFE(next)}`);
  resetFailures(next);

  const prevEntry = runtime.get(taskId);
  const carry: RuntimeEntry | undefined = prevEntry;
  await runAgentForTask(taskId, next, { fresh: false, excludePrev: currentAgent });
  const newEntry = runtime.get(taskId);
  if (newEntry && carry) {
    newEntry.stepIndex = carry.stepIndex;
    newEntry.exhaustedOnce = true;
    runtime.set(taskId, newEntry);
  } else if (newEntry) {
    newEntry.exhaustedOnce = true;
    runtime.set(taskId, newEntry);
  }
  await emit(taskId, "handoff_complete", `${AGENT_DISPLAY_NAMES[next]} đã khôi phục context và tiếp tục công việc.`, next);
}

function AGENT_DISPLAY_NAME_SAFE(id: AgentId) {
  return AGENT_DISPLAY_NAMES[id];
}

export async function pauseTask(taskId: string) {
  await stopRuntime(taskId, false);
  await setTaskStatus(taskId, "paused");
  await emit(taskId, "activity", "Công việc đã tạm dừng.");
  await timeline(taskId, "Tạm dừng công việc");
}

export async function resumeTask(taskId: string) {
  const task = await getTask(taskId);
  if (!task) return;
  const agent = (task.activeAgent as AgentId) ?? undefined;
  if (agent) {
    await runAgentForTask(taskId, agent, { fresh: false });
    await timeline(taskId, "Tiếp tục công việc");
  } else {
    await startTask(taskId);
  }
}

export async function takeOverTask(taskId: string) {
  const entry = runtime.get(taskId);
  if (entry?.terminalId) killSession(entry.terminalId);
  await stopRuntime(taskId, false);
  const task = await getTask(taskId);
  if (task) {
    const workspace = await getWorkspace(task.workspaceId);
    if (workspace) {
      await syncGitState(workspace.path, taskId);
      await appendProgress(workspace.path, taskId, "Người dùng đã tiếp quản Workspace.");
    }
  }
  await setTaskStatus(taskId, "human_control");
  await emit(taskId, "human_control", "AI Agent đã tạm dừng. Bạn đang trực tiếp kiểm soát Workspace.");
  await timeline(taskId, "Người dùng tiếp quản");
}

export async function handBackTask(taskId: string, agentChoice: AgentId | "auto") {
  const task = await getTask(taskId);
  if (!task) return;
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) return;
  await syncGitState(workspace.path, taskId);
  await appendProgress(workspace.path, taskId, "Đã giao lại công việc cho Agent sau khi người dùng chỉnh sửa thủ công.");
  await timeline(taskId, "Giao lại cho Agent");

  const cfg = await getSettings();
  const priority = (cfg.agentPriority as AgentId[]) ?? AGENT_IDS;
  const mode = (cfg.routingMode as RoutingMode) ?? "smart";
  const chosen =
    agentChoice === "auto"
      ? await chooseAgent({ mode, priority })
      : await chooseAgent({ mode: "manual", priority, preferred: agentChoice });

  if (!chosen) {
    await emit(taskId, "error", "Không có Agent nào khả dụng để tiếp tục.");
    await setTaskStatus(taskId, "human_control");
    return;
  }
  await runAgentForTask(taskId, chosen, { fresh: false });
}

export async function stopTask(taskId: string) {
  const entry = runtime.get(taskId);
  if (entry?.agentSessionId) {
    await db.update(agentSessions).set({ status: "stopped", endedAt: new Date() }).where(eq(agentSessions.id, entry.agentSessionId));
  }
  await stopRuntime(taskId, true);
  await setTaskStatus(taskId, "paused");
  await emit(taskId, "activity", "Công việc đã dừng theo yêu cầu người dùng.");
  await timeline(taskId, "Dừng công việc");
}

export async function manualCheckpoint(taskId: string) {
  const task = await getTask(taskId);
  if (!task) throw new Error("TASK_NOT_FOUND");
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
  await syncGitState(workspace.path, taskId);
  const entry = runtime.get(taskId);
  const cp = await createCheckpoint(workspace.path, taskId, { reason: "manual", agentSessionId: entry?.agentSessionId });
  await emit(taskId, "checkpoint", `Đã tạo Checkpoint ${cp.name} theo yêu cầu người dùng.`, task.activeAgent);
  await timeline(taskId, "Checkpoint thủ công", cp.name);
  return cp;
}

export async function manualSwitchAgent(taskId: string, agent: AgentId) {
  await triggerFailureManualSwitch(taskId, agent);
}

async function triggerFailureManualSwitch(taskId: string, agent: AgentId) {
  const task = await getTask(taskId);
  if (!task) return;
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) return;
  const entry = runtime.get(taskId);
  await setTaskStatus(taskId, "checkpointing");
  await syncGitState(workspace.path, taskId);
  const cp = await createCheckpoint(workspace.path, taskId, { reason: "manual_switch", agentSessionId: entry?.agentSessionId });
  await emit(taskId, "checkpoint", `Đã tạo Checkpoint ${cp.name} trước khi chuyển Agent.`, task.activeAgent);
  await stopRuntime(taskId, true);
  await setTaskStatus(taskId, "handoff");
  await emit(taskId, "routing", `Người dùng chọn chuyển sang ${AGENT_DISPLAY_NAMES[agent]}.`, agent);
  await runAgentForTask(taskId, agent, { fresh: false });
}

export function getRuntimeEntry(taskId: string) {
  return runtime.get(taskId);
}
