import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, agents, agentSessions, agentEvents, workspaces, taskTimeline } from "@/db/schema";
import {
  AGENT_DISPLAY_NAMES,
  AGENT_IDS,
  UNKNOWN_USAGE,
  type AgentEvent,
  type AgentId,
  type AgentUsage,
} from "../agents/types";
import { getAdapter } from "../agents/adapters";
import { stripAnsi } from "../agents/parse";
import {
  appendDecision,
  appendProgress,
  appendTerminalHistory,
  buildContextPackage,
  buildHandoffPrompt,
  buildInitialPrompt,
  initTaskContext,
  readSessions,
  readTodo,
  recordFilesTouched,
  recordSession,
  recordTestResult,
  syncGitState,
} from "../context";
import { createCheckpoint } from "../checkpoints";
import {
  createTerminalSession,
  disposeSession,
  getCommandLog,
  getTailOutput,
  killSession,
  subscribeSession,
  writeToSession,
} from "../terminal";
import { gitCreateBranch, gitStatus, isGitRepository } from "../git";
import { redactSecrets } from "../security-shared";
import { publish } from "./bus";
import {
  applyWarningThreshold,
  getAllUsage,
  getFailureCount,
  getUsage,
  recordFailure,
  resetFailures,
  setUsage,
} from "./usage";
import {
  isTaskError,
  pickNextAgent,
  shouldPreemptivelyHandoff,
  type AgentRuntimeState,
  type TaskMode,
} from "../routing";
import {
  aggregateAgentUsage,
  applyUsageToAccount,
  ensureDefaultAccounts,
  isAccountUsable,
  listAccounts,
  markAccountStatus,
  selectAccount,
  type ProviderAccountView,
} from "../providers/accounts";
import { getSettings } from "./settings";
import { simulationSteps, simulatorNotice } from "./simulator";

interface RuntimeEntry {
  taskId: string;
  workspaceId: string;
  workspaceRoot: string;
  agent: AgentId;
  accountId: string | null;
  terminalId?: string;
  agentSessionId: string;
  mode: string;
  title: string;
  description: string;
  real: boolean;
  unsubscribe?: () => void;
  /** Simulator bookkeeping (only used when the CLI is absent). */
  simTimer?: NodeJS.Timeout;
  simIndex: number;
  finishing: boolean;
  handingOff: boolean;
  outputTail: string;
  touchedFiles: Set<string>;
}

const globalStore = globalThis as typeof globalThis & {
  __ideTaskRuntime?: Map<string, RuntimeEntry>;
};
const runtime = globalStore.__ideTaskRuntime ?? new Map<string, RuntimeEntry>();
globalStore.__ideTaskRuntime = runtime;

// ---------------------------------------------------------------- utilities

async function emit(
  taskId: string,
  type: string,
  message: string,
  agent?: string | null,
  meta?: Record<string, unknown>,
) {
  const id = randomUUID();
  const createdAt = new Date();
  const safeMessage = redactSecrets(message);
  await db
    .insert(agentEvents)
    .values({ id, taskId, agent: agent ?? null, type, message: safeMessage, meta: meta ?? null, createdAt });
  publish({ taskId, type, message: safeMessage, agent, meta, createdAt: createdAt.toISOString() });
}

async function timeline(taskId: string, label: string, detail?: string) {
  await db.insert(taskTimeline).values({ id: randomUUID(), taskId, label, detail: detail ?? null });
  publish({
    taskId,
    type: "timeline",
    message: label,
    meta: { detail },
    createdAt: new Date().toISOString(),
  });
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

// ------------------------------------------------------------ runtime state

/** Refreshes agent installation + usage, honouring the account layer. */
export async function getRuntimeStates(): Promise<Record<AgentId, AgentRuntimeState>> {
  await ensureDefaultAccounts(AGENT_IDS);
  const config = await getSettings();
  const result = {} as Record<AgentId, AgentRuntimeState>;

  for (const id of AGENT_IDS) {
    const adapter = getAdapter(id);
    const health = await adapter.health();

    const rows = await db.select().from(agents).where(eq(agents.id, id));
    const existing = rows[0];
    const values = {
      id,
      name: AGENT_DISPLAY_NAMES[id],
      binaryPath: health.binaryPath ?? null,
      version: health.version ?? null,
      installed: health.installed,
      enabled: existing?.enabled ?? true,
      lastCheckedAt: new Date(),
    };
    if (existing) {
      await db.update(agents).set(values).where(eq(agents.id, id));
    } else {
      await db.insert(agents).values(values);
    }

    const accounts = await listAccounts(id);
    const live = getUsage(id);
    const aggregated = accounts.length ? aggregateAgentUsage(accounts) : UNKNOWN_USAGE;
    // Live in-memory status (from error detection) wins over the stored aggregate.
    const usage = live.status === "unknown" ? aggregated : live;

    result[id] = {
      id,
      installed: health.installed,
      enabled: values.enabled,
      usageStatus: applyWarningThreshold(usage, config.warningThreshold).status,
      percentageUsed: usage.percentageUsed,
      recentFailures: getFailureCount(id),
      hasUsableAccount: accounts.length === 0 ? true : accounts.some(isAccountUsable),
    };
  }
  return result;
}

async function chooseAgent(opts: {
  preferred?: AgentId | null;
  exclude?: AgentId[];
  taskMode?: TaskMode;
}): Promise<AgentId | null> {
  const config = await getSettings();
  const states = await getRuntimeStates();
  const manual = Boolean(opts.preferred);
  const picked = pickNextAgent(states, {
    mode: manual ? "manual" : config.routingMode,
    priority: config.agentPriority,
    preferred: opts.preferred,
    exclude: opts.exclude,
    taskMode: opts.taskMode,
  });
  if (picked) return picked;

  // Nothing is installed. If the user has explicitly enabled simulation we may
  // still pick an agent — `startAgent` will then run the clearly-labelled
  // simulator instead of a real CLI. Quota/disabled blocks are still respected.
  if (!config.simulateWhenMissing) return null;

  const exclude = new Set(opts.exclude ?? []);
  const candidates = pickNextAgent(
    Object.fromEntries(
      AGENT_IDS.map((id) => [id, { ...states[id], installed: true }]),
    ) as Record<AgentId, AgentRuntimeState>,
    {
      mode: manual ? "manual" : config.routingMode,
      priority: config.agentPriority,
      preferred: opts.preferred,
      exclude: [...exclude],
      taskMode: opts.taskMode,
    },
  );
  return candidates;
}

/** Tier-1: choose the account to run this agent with (plan §18). */
async function chooseAccount(agent: AgentId, exclude: string[] = []): Promise<ProviderAccountView | null> {
  await ensureDefaultAccounts([agent]);
  const accounts = await listAccounts(agent);
  return selectAccount(accounts, { exclude });
}

// --------------------------------------------------------------- test runner

async function detectTestCommand(root: string): Promise<{ cmd: string; args: string[] } | null> {
  const pkgPath = path.join(root, "package.json");
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
    if (pkg.scripts?.test) return { cmd: "npm", args: ["test", "--silent"] };
  } catch {
    // not a node project
  }
  return null;
}

async function runProjectTests(root: string): Promise<{ ok: boolean; output: string; skipped: boolean }> {
  const testCommand = await detectTestCommand(root);
  if (!testCommand) return { ok: true, output: "(không tìm thấy lệnh test, bỏ qua)", skipped: true };

  return new Promise((resolve) => {
    execFile(
      testCommand.cmd,
      testCommand.args,
      { cwd: root, timeout: 120_000, maxBuffer: 1024 * 1024 * 8 },
      (error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`.trim();
        resolve({ ok: !error, output, skipped: false });
      },
    );
  });
}

// ------------------------------------------------------------ agent lifecycle

async function captureGitTouchedFiles(root: string): Promise<string[]> {
  const status = await gitStatus(root);
  return status.files.map((file) => file.path);
}

/**
 * Handles one parsed event from the agent's output stream.
 * This is where real (never invented) usage and failure signals enter the system.
 */
async function handleAgentEvent(entry: RuntimeEntry, event: AgentEvent) {
  const config = await getSettings();

  if (event.usage) {
    const usage = applyWarningThreshold(event.usage, config.warningThreshold);
    await setUsage(entry.agent, usage, entry.accountId);
    if (entry.accountId) await applyUsageToAccount(entry.accountId, usage, config.warningThreshold);
    await emit(entry.taskId, "usage", `Mức sử dụng ${AGENT_DISPLAY_NAMES[entry.agent]}: ${describeUsage(usage)}`, entry.agent, {
      usage,
    });
  }

  if (event.type === "file_change" && event.files?.length) {
    for (const file of event.files) entry.touchedFiles.add(file);
    await recordFilesTouched(entry.workspaceRoot, entry.taskId, event.files);
    await emit(entry.taskId, "file_change", `Đã thay đổi: ${event.files.join(", ")}`, entry.agent, {
      files: event.files,
    });
    return;
  }

  if (event.type === "task_error" && event.taskErrorReason) {
    // Plan §36: this is the task's problem, the agent keeps working.
    await emit(
      entry.taskId,
      "task_error",
      `Lỗi thuộc về task (${event.taskErrorReason}) — Agent tiếp tục xử lý, không chuyển Agent.`,
      entry.agent,
      { reason: event.taskErrorReason },
    );
    return;
  }

  if (event.type === "provider_error" && event.failoverReason) {
    await emit(entry.taskId, "provider_error", event.message, entry.agent, { reason: event.failoverReason });
    await handleProviderFailure(entry.taskId, event.failoverReason);
    return;
  }

  if (event.type === "activity") {
    await emit(entry.taskId, "activity", event.message, entry.agent);
  }
}

function describeUsage(usage: AgentUsage): string {
  if (typeof usage.percentageUsed === "number") return `${usage.percentageUsed}%`;
  if (typeof usage.remaining === "number") return `còn ${usage.remaining}`;
  return "không xác định";
}

/** Extracts a provider session id so we can resume later (plan §29). */
function extractSessionId(text: string): string | null {
  const match = stripAnsi(text).match(/session[_\s-]?id["':\s]+([\w-]{8,})/i);
  return match ? match[1] : null;
}

async function attachOutputStream(entry: RuntimeEntry) {
  if (!entry.terminalId) return;
  const adapter = getAdapter(entry.agent);
  let buffer = "";

  entry.unsubscribe = subscribeSession(
    entry.terminalId,
    (chunk) => {
      entry.outputTail = (entry.outputTail + chunk).slice(-8000);
      buffer += chunk;

      // Process complete lines only, so patterns aren't split across chunks.
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const sessionId = extractSessionId(line);
        if (sessionId) {
          void db
            .update(agentSessions)
            .set({ providerSessionId: sessionId })
            .where(eq(agentSessions.id, entry.agentSessionId))
            .catch(() => {});
          void recordSession(entry.workspaceRoot, entry.taskId, entry.agent, sessionId).catch(() => {});
        }

        const event = adapter.parseEvent(line);
        if (event) {
          void handleAgentEvent(entry, event).catch(() => {});
        }
      }
    },
    (code) => {
      void onAgentExit(entry.taskId, code).catch(() => {});
    },
  );
}

/** Called when the agent process exits on its own. */
async function onAgentExit(taskId: string, exitCode: number) {
  const entry = runtime.get(taskId);
  if (!entry || entry.finishing || entry.handingOff) return;
  entry.finishing = true;

  const task = await getTask(taskId);
  if (!task || ["paused", "human_control", "completed"].includes(task.status)) {
    entry.finishing = false;
    return;
  }

  // A non-zero exit may still carry a provider failure signal in the tail.
  if (exitCode !== 0) {
    const adapter = getAdapter(entry.agent);
    const event = adapter.parseEvent(entry.outputTail);
    if (event?.failoverReason) {
      entry.finishing = false;
      await emit(taskId, "provider_error", event.message, entry.agent, { reason: event.failoverReason });
      await handleProviderFailure(taskId, event.failoverReason);
      return;
    }
  }

  await finalizeTask(taskId, exitCode);
}

/** Runs tests, records state and decides completed vs. needs-more-work. */
async function finalizeTask(taskId: string, exitCode: number) {
  const entry = runtime.get(taskId);
  if (!entry) return;

  await emit(taskId, "activity", `${AGENT_DISPLAY_NAMES[entry.agent]} đã kết thúc phiên làm việc.`, entry.agent, {
    exitCode,
  });

  // Capture everything the agent actually changed.
  const changed = await captureGitTouchedFiles(entry.workspaceRoot);
  if (changed.length) await recordFilesTouched(entry.workspaceRoot, taskId, changed);

  const commands = entry.terminalId ? getCommandLog(entry.terminalId, 20) : [];
  for (const command of commands) {
    await appendTerminalHistory(entry.workspaceRoot, taskId, command);
  }

  await setTaskStatus(taskId, "checkpointing");
  await emit(taskId, "activity", "Đang chạy kiểm thử...", entry.agent);

  const testResult = await runProjectTests(entry.workspaceRoot);
  await recordTestResult(
    entry.workspaceRoot,
    taskId,
    testResult.skipped ? testResult.output : `${testResult.ok ? "PASS" : "FAIL"} — ${testResult.output.slice(0, 2000)}`,
  );
  await emit(
    taskId,
    testResult.ok ? "test_pass" : "test_fail",
    testResult.skipped
      ? "Không có lệnh test để chạy."
      : testResult.ok
        ? "✓ Test đã pass"
        : `✗ Test thất bại: ${redactSecrets(testResult.output.slice(0, 400))}`,
    entry.agent,
  );

  await syncGitState(entry.workspaceRoot, taskId);
  await appendProgress(
    entry.workspaceRoot,
    taskId,
    `${AGENT_DISPLAY_NAMES[entry.agent]} kết thúc phiên (exit ${exitCode}). Test: ${
      testResult.skipped ? "bỏ qua" : testResult.ok ? "pass" : "fail"
    }.`,
  );

  await db
    .update(agentSessions)
    .set({ status: testResult.ok ? "completed" : "failed", endedAt: new Date() })
    .where(eq(agentSessions.id, entry.agentSessionId));

  const remaining = await readTodo(entry.workspaceRoot, taskId);

  if (testResult.ok && exitCode === 0) {
    await createCheckpoint(entry.workspaceRoot, taskId, {
      reason: "task_completed",
      agentSessionId: entry.agentSessionId,
      agent: entry.agent,
      terminalTail: entry.outputTail,
    });
    await setTaskStatus(taskId, "completed", { completedAt: new Date() });
    await timeline(taskId, "Task hoàn thành");
    await emit(taskId, "task_completed", `${taskId} đã HOÀN THÀNH.`, entry.agent);
  } else {
    // Task-level failure: keep the same agent, hand control back to the human.
    await createCheckpoint(entry.workspaceRoot, taskId, {
      reason: testResult.ok ? "session_ended" : "test_failed",
      agentSessionId: entry.agentSessionId,
      agent: entry.agent,
      terminalTail: entry.outputTail,
    });
    await setTaskStatus(taskId, "paused");
    await timeline(
      taskId,
      testResult.ok ? "Phiên Agent kết thúc" : "Test chưa pass",
      remaining.length ? `Còn ${remaining.length} việc trong todo.md` : undefined,
    );
    await emit(
      taskId,
      "activity",
      testResult.ok
        ? "Agent đã dừng. Bạn có thể tiếp tục hoặc tiếp quản."
        : "Test chưa pass — đây là lỗi task, không chuyển Agent. Hãy tiếp tục Agent hoặc tiếp quản.",
      entry.agent,
    );
  }

  await stopRuntime(taskId, true);
}

// ------------------------------------------------------------------ start

async function launchAgent(
  taskId: string,
  agent: AgentId,
  opts: { fresh: boolean; resumeFrom?: AgentId },
): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) return;

  const config = await getSettings();
  const adapter = getAdapter(agent);
  const health = await adapter.health();

  const account = await chooseAccount(agent);
  const sessionId = randomUUID();
  await db.insert(agentSessions).values({
    id: sessionId,
    taskId,
    agent,
    providerAccountId: account?.id ?? null,
    status: "running",
  });
  await recordSession(workspace.path, taskId, agent, sessionId);

  // Build the prompt: fresh task vs. handoff (context restored from disk).
  let prompt: string;
  if (opts.fresh) {
    prompt = buildInitialPrompt(taskId, task.title, task.description, task.mode);
    await appendProgress(workspace.path, taskId, `Bắt đầu công việc với ${AGENT_DISPLAY_NAMES[agent]}.`);
  } else {
    const pkg = await buildContextPackage(workspace.path, taskId);
    prompt = buildHandoffPrompt(taskId, pkg);
    await appendProgress(
      workspace.path,
      taskId,
      `${AGENT_DISPLAY_NAMES[agent]} tiếp quản công việc${opts.resumeFrom ? ` từ ${AGENT_DISPLAY_NAMES[opts.resumeFrom]}` : ""}.`,
    );
  }

  const entry: RuntimeEntry = {
    taskId,
    workspaceId: workspace.id,
    workspaceRoot: workspace.path,
    agent,
    accountId: account?.id ?? null,
    agentSessionId: sessionId,
    mode: task.mode,
    title: task.title,
    description: task.description,
    real: health.installed,
    simIndex: 0,
    finishing: false,
    handingOff: false,
    outputTail: "",
    touchedFiles: new Set(),
  };

  if (health.installed) {
    // Real CLI — this is the only path that may modify source code.
    const sessions = await readSessions(workspace.path, taskId);
    const providerSessionId = sessions[agent] && !opts.fresh ? sessions[agent] : null;
    const args = opts.fresh
      ? adapter.buildArgs({ taskId, workspaceRoot: workspace.path, prompt })
      : (adapter as unknown as { buildResumeArgs: (i: unknown) => string[] }).buildResumeArgs({
          taskId,
          workspaceRoot: workspace.path,
          prompt,
          providerSessionId,
        });

    const meta = createTerminalSession({
      workspaceId: workspace.id,
      type: "agent",
      cwd: workspace.path,
      title: `${AGENT_DISPLAY_NAMES[agent]} · ${taskId}`,
      agent,
      taskId,
      command: adapter.binary,
      args,
    });
    entry.terminalId = meta.id;
  } else if (config.simulateWhenMissing) {
    // No CLI: run a clearly-labelled simulator in a real shell. It never edits source.
    const meta = createTerminalSession({
      workspaceId: workspace.id,
      type: "agent",
      cwd: workspace.path,
      title: `${AGENT_DISPLAY_NAMES[agent]} (mô phỏng) · ${taskId}`,
      agent,
      taskId,
    });
    entry.terminalId = meta.id;
    entry.real = false;
    await emit(taskId, "activity", simulatorNotice(agent), agent, { simulated: true });
    startSimulator(entry);
  } else {
    await emit(
      taskId,
      "error",
      `${AGENT_DISPLAY_NAMES[agent]} CLI chưa được cài đặt và chế độ mô phỏng đang tắt.`,
      agent,
    );
    await setTaskStatus(taskId, "human_control");
    return;
  }

  await db.update(agentSessions).set({ terminalId: entry.terminalId }).where(eq(agentSessions.id, sessionId));
  await db
    .update(tasks)
    .set({ activeAgent: agent, activeProviderAccountId: account?.id ?? null, status: "running" })
    .where(eq(tasks.id, taskId));

  runtime.set(taskId, entry);
  await attachOutputStream(entry);

  await emit(
    taskId,
    "agent_started",
    health.installed
      ? `${AGENT_DISPLAY_NAMES[agent]} bắt đầu xử lý công việc${account ? ` (tài khoản ${account.name})` : ""}.`
      : `${AGENT_DISPLAY_NAMES[agent]} đang chạy ở chế độ mô phỏng.`,
    agent,
    { installed: health.installed, accountId: account?.id ?? null },
  );
  await timeline(
    taskId,
    `${AGENT_DISPLAY_NAMES[agent]} bắt đầu xử lý`,
    opts.fresh ? undefined : "Đã khôi phục context từ checkpoint",
  );

  // Ask the adapter for a real usage reading, if the CLI exposes one.
  void adapter
    .usage()
    .then(async (usage) => {
      if (usage.status === "unknown" && usage.percentageUsed === undefined) return;
      const normalized = applyWarningThreshold(usage, config.warningThreshold);
      await setUsage(agent, normalized, account?.id ?? null);
      if (account) await applyUsageToAccount(account.id, normalized, config.warningThreshold);
    })
    .catch(() => {});
}

function startSimulator(entry: RuntimeEntry) {
  const steps = simulationSteps(entry.agent, entry.mode, entry.taskId);
  entry.simIndex = 0;

  const tick = async () => {
    const current = runtime.get(entry.taskId);
    if (!current || current.terminalId !== entry.terminalId) return;

    const task = await getTask(entry.taskId);
    if (!task || ["paused", "human_control", "completed"].includes(task.status)) return;

    if (entry.simIndex >= steps.length) {
      if (entry.simTimer) clearInterval(entry.simTimer);
      entry.simTimer = undefined;
      await finalizeTask(entry.taskId, 0);
      return;
    }

    const step = steps[entry.simIndex++];
    await emit(entry.taskId, "activity", `${AGENT_DISPLAY_NAMES[entry.agent]}: ${step.label}`, entry.agent, {
      simulated: true,
    });
    if (entry.terminalId) writeToSession(entry.terminalId, `${step.command}\r`);
    await appendProgress(entry.workspaceRoot, entry.taskId, `[mô phỏng] ${step.label}`);
  };

  entry.simTimer = setInterval(() => {
    void tick().catch(() => {});
  }, 2500);
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

  const config = await getSettings();

  // Optional: dedicated branch per task (plan §42).
  if (config.autoCreateBranch && (await isGitRepository(workspace.path))) {
    const branchName = `agent/${taskId}`;
    const result = await gitCreateBranch(workspace.path, branchName);
    if (result.ok) {
      await db.update(tasks).set({ branch: branchName }).where(eq(tasks.id, taskId));
      await emit(taskId, "activity", `Đã tạo branch ${branchName}.`);
      await timeline(taskId, `Tạo branch ${branchName}`);
    }
  }

  await syncGitState(workspace.path, taskId);

  const preferredRaw = opts?.agent ?? task.preferredAgent;
  const preferred = preferredRaw && preferredRaw !== "auto" ? (preferredRaw as AgentId) : null;

  const chosen = await chooseAgent({ preferred, taskMode: task.mode as TaskMode });
  if (!chosen) {
    await emit(taskId, "error", "Không có Agent nào khả dụng để bắt đầu công việc.");
    await setTaskStatus(taskId, "human_control");
    await timeline(taskId, "Không có Agent khả dụng", "Người dùng cần tiếp quản Workspace.");
    return;
  }

  await launchAgent(taskId, chosen, { fresh: true });
}

// ----------------------------------------------------------------- failover

async function stopRuntime(taskId: string, killTerminal = true) {
  const entry = runtime.get(taskId);
  if (!entry) return;
  if (entry.simTimer) clearInterval(entry.simTimer);
  entry.unsubscribe?.();
  if (killTerminal && entry.terminalId) killSession(entry.terminalId);
  runtime.delete(taskId);
}

/**
 * Provider failure → soft handoff (another account) or hard handoff (another
 * agent). Task errors never reach here (plan §36).
 */
export async function handleProviderFailure(taskId: string, reason: string) {
  const entry = runtime.get(taskId);
  const task = await getTask(taskId);
  if (!task) return;
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) return;

  if (isTaskError(reason)) {
    await emit(taskId, "task_error", `Lỗi task (${reason}) — Agent phải tiếp tục xử lý.`, task.activeAgent);
    return;
  }

  const currentAgent = (entry?.agent ?? task.activeAgent) as AgentId | undefined;
  if (!currentAgent) return;

  // Guard against re-entrancy while a handoff is already running.
  if (entry?.handingOff) return;
  if (entry) entry.handingOff = true;

  const config = await getSettings();
  const readable: Record<string, string> = {
    quota_exhausted: "đã hết hạn mức sử dụng",
    rate_limit: "bị giới hạn tần suất (rate limit)",
    provider_unavailable: "không khả dụng",
    authentication_error: "gặp lỗi xác thực",
    repeated_provider_error: "gặp lỗi liên tục từ provider",
  };

  recordFailure(currentAgent);
  await emit(
    taskId,
    "provider_error",
    `${AGENT_DISPLAY_NAMES[currentAgent]} ${readable[reason] ?? reason}.`,
    currentAgent,
    { reason },
  );

  // Record the real status on the failing account.
  const failingAccountId = entry?.accountId ?? task.activeProviderAccountId ?? null;
  if (failingAccountId) {
    if (reason === "quota_exhausted") await markAccountStatus(failingAccountId, "exhausted");
    else if (reason === "rate_limit") await markAccountStatus(failingAccountId, "rate_limited");
  }
  if (reason === "quota_exhausted") {
    await setUsage(currentAgent, { status: "quota_exhausted", source: "error_detection" }, failingAccountId);
  } else if (reason === "rate_limit") {
    await setUsage(currentAgent, { status: "rate_limited", source: "error_detection" }, failingAccountId);
  }

  if (!config.autoHandoff) {
    await emit(taskId, "activity", "Tự động chuyển Agent đang tắt — cần người dùng xử lý.", currentAgent);
    await setTaskStatus(taskId, "human_control");
    await stopRuntime(taskId, true);
    return;
  }

  // Always checkpoint before any handoff (rule #10).
  await setTaskStatus(taskId, "checkpointing");
  await timeline(taskId, "Đang tạo checkpoint", `Lý do: ${reason}`);
  await syncGitState(workspace.path, taskId);

  const changed = await captureGitTouchedFiles(workspace.path);
  if (changed.length) await recordFilesTouched(workspace.path, taskId, changed);
  if (entry?.terminalId) {
    for (const command of getCommandLog(entry.terminalId, 20)) {
      await appendTerminalHistory(workspace.path, taskId, command);
    }
  }

  const checkpoint = await createCheckpoint(workspace.path, taskId, {
    reason,
    agentSessionId: entry?.agentSessionId,
    agent: currentAgent,
    terminalTail: entry?.terminalId ? getTailOutput(entry.terminalId) : entry?.outputTail,
  });
  await emit(taskId, "checkpoint", `Đã tạo Checkpoint ${checkpoint.name}.`, currentAgent, {
    checkpointId: checkpoint.id,
  });

  if (entry?.agentSessionId) {
    await db
      .update(agentSessions)
      .set({ status: "failed", endedAt: new Date() })
      .where(eq(agentSessions.id, entry.agentSessionId));
  }
  await stopRuntime(taskId, true);

  // --- Tier 1: try another account of the SAME agent (soft handoff).
  const nextAccount = await chooseAccount(currentAgent, failingAccountId ? [failingAccountId] : []);
  if (nextAccount) {
    await setTaskStatus(taskId, "handoff");
    await emit(
      taskId,
      "routing",
      `Chuyển ${AGENT_DISPLAY_NAMES[currentAgent]} sang tài khoản ${nextAccount.name}.`,
      currentAgent,
      { softHandoff: true, accountId: nextAccount.id },
    );
    await timeline(taskId, `Chuyển sang tài khoản ${nextAccount.name}`, "Soft handoff");
    // The agent itself is healthy again on a fresh account.
    await setUsage(currentAgent, UNKNOWN_USAGE, nextAccount.id);
    await launchAgent(taskId, currentAgent, { fresh: false, resumeFrom: currentAgent });
    return;
  }

  // --- Tier 2: switch agent (hard handoff).
  await setTaskStatus(taskId, "handoff");
  await timeline(taskId, "Đang chuyển Agent");

  const next = await chooseAgent({ exclude: [currentAgent], taskMode: task.mode as TaskMode });
  if (!next) {
    await emit(taskId, "error", "Không còn Agent nào khả dụng. Vui lòng tiếp quản Workspace.", currentAgent);
    await setTaskStatus(taskId, "human_control");
    await timeline(taskId, "Không còn Agent khả dụng", "Cần người dùng tiếp quản.");
    return;
  }

  await emit(taskId, "routing", `Router chọn ${AGENT_DISPLAY_NAMES[next]} để tiếp tục công việc.`, next);
  await timeline(taskId, `Đang chuyển sang ${AGENT_DISPLAY_NAMES[next]}`);
  resetFailures(next);

  await launchAgent(taskId, next, { fresh: false, resumeFrom: currentAgent });
  await emit(
    taskId,
    "handoff_complete",
    `${AGENT_DISPLAY_NAMES[next]} đã khôi phục context và tiếp tục công việc.`,
    next,
  );
  await timeline(taskId, `${AGENT_DISPLAY_NAMES[next]} đã khôi phục context`);
}

/** Manual/simulated provider failure trigger (used by the UI and tests). */
export async function triggerFailure(taskId: string, reason: string) {
  await handleProviderFailure(taskId, reason);
}

/** Preemptive handoff before hitting the wall (plan §37). */
export async function maybePreemptiveHandoff(taskId: string): Promise<boolean> {
  const entry = runtime.get(taskId);
  if (!entry) return false;
  const config = await getSettings();
  if (!config.preemptiveHandoff || !config.autoHandoff) return false;

  const states = await getRuntimeStates();
  const current = states[entry.agent];
  if (!shouldPreemptivelyHandoff(current, states, config.warningThreshold)) return false;

  await emit(
    taskId,
    "routing",
    `${AGENT_DISPLAY_NAMES[entry.agent]} đạt ngưỡng cảnh báo ${config.warningThreshold}% — chuyển Agent trước khi hết hạn mức.`,
    entry.agent,
  );
  await handleProviderFailure(taskId, "quota_exhausted");
  return true;
}

// ------------------------------------------------------------ human control

export async function pauseTask(taskId: string) {
  const entry = runtime.get(taskId);
  if (entry?.simTimer) clearInterval(entry.simTimer);
  await stopRuntime(taskId, true);
  await setTaskStatus(taskId, "paused");
  await emit(taskId, "activity", "Công việc đã tạm dừng.");
  await timeline(taskId, "Tạm dừng công việc");
}

export async function resumeTask(taskId: string, agentChoice?: AgentId | "auto") {
  const task = await getTask(taskId);
  if (!task) return;

  const preferred = agentChoice && agentChoice !== "auto" ? agentChoice : (task.activeAgent as AgentId | null);
  const chosen = await chooseAgent({ preferred, taskMode: task.mode as TaskMode });
  if (!chosen) {
    await emit(taskId, "error", "Không có Agent nào khả dụng để tiếp tục.");
    await setTaskStatus(taskId, "human_control");
    return;
  }
  await timeline(taskId, "Tiếp tục công việc");
  await launchAgent(taskId, chosen, { fresh: false });
}

export async function takeOverTask(taskId: string) {
  const task = await getTask(taskId);
  const entry = runtime.get(taskId);
  if (entry?.simTimer) clearInterval(entry.simTimer);
  await stopRuntime(taskId, true);

  if (task) {
    const workspace = await getWorkspace(task.workspaceId);
    if (workspace) {
      await syncGitState(workspace.path, taskId);
      const changed = await captureGitTouchedFiles(workspace.path);
      if (changed.length) await recordFilesTouched(workspace.path, taskId, changed);
      await appendProgress(workspace.path, taskId, "Người dùng đã tiếp quản Workspace.");
      await createCheckpoint(workspace.path, taskId, {
        reason: "human_takeover",
        agentSessionId: entry?.agentSessionId,
        agent: task.activeAgent,
        terminalTail: entry?.outputTail,
      });
    }
  }

  await setTaskStatus(taskId, "human_control");
  await emit(taskId, "human_control", "AI Agent đã tạm dừng. Bạn đang trực tiếp kiểm soát Workspace.");
  await timeline(taskId, "Người dùng tiếp quản");
}

/**
 * Hand work back to an agent after manual edits.
 * Captures the user's changes first so nothing they did is undone (plan §60).
 */
export async function handBackTask(taskId: string, agentChoice: AgentId | "auto") {
  const task = await getTask(taskId);
  if (!task) return;
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) return;

  await syncGitState(workspace.path, taskId);
  const changed = await captureGitTouchedFiles(workspace.path);
  if (changed.length) {
    await recordFilesTouched(workspace.path, taskId, changed);
    await emit(taskId, "file_change", `Ghi nhận thay đổi thủ công: ${changed.join(", ")}`, null, { files: changed });
  }

  const testResult = await runProjectTests(workspace.path);
  if (!testResult.skipped) {
    await recordTestResult(
      workspace.path,
      taskId,
      `${testResult.ok ? "PASS" : "FAIL"} (sau khi người dùng sửa) — ${testResult.output.slice(0, 1000)}`,
    );
  }

  await appendProgress(
    workspace.path,
    taskId,
    "Đã giao lại công việc cho Agent sau khi người dùng chỉnh sửa thủ công.",
  );
  await createCheckpoint(workspace.path, taskId, { reason: "human_handback", agent: task.activeAgent });
  await timeline(taskId, "Giao lại cho Agent");

  const preferred = agentChoice === "auto" ? null : agentChoice;
  const chosen = await chooseAgent({ preferred, taskMode: task.mode as TaskMode });
  if (!chosen) {
    await emit(taskId, "error", "Không có Agent nào khả dụng để tiếp tục.");
    await setTaskStatus(taskId, "human_control");
    return;
  }
  await launchAgent(taskId, chosen, { fresh: false });
}

export async function stopTask(taskId: string) {
  const entry = runtime.get(taskId);
  if (entry?.agentSessionId) {
    await db
      .update(agentSessions)
      .set({ status: "stopped", endedAt: new Date() })
      .where(eq(agentSessions.id, entry.agentSessionId));
  }
  if (entry?.simTimer) clearInterval(entry.simTimer);
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
  const checkpoint = await createCheckpoint(workspace.path, taskId, {
    reason: "manual",
    agentSessionId: entry?.agentSessionId,
    agent: task.activeAgent,
    terminalTail: entry?.outputTail,
  });
  await emit(taskId, "checkpoint", `Đã tạo Checkpoint ${checkpoint.name} theo yêu cầu người dùng.`, task.activeAgent, {
    checkpointId: checkpoint.id,
  });
  await timeline(taskId, "Checkpoint thủ công", checkpoint.name);
  return checkpoint;
}

/** User-initiated agent switch — still creates a checkpoint first. */
export async function manualSwitchAgent(taskId: string, agent: AgentId) {
  const task = await getTask(taskId);
  if (!task) return;
  const workspace = await getWorkspace(task.workspaceId);
  if (!workspace) return;

  const entry = runtime.get(taskId);
  await setTaskStatus(taskId, "checkpointing");
  await syncGitState(workspace.path, taskId);
  const changed = await captureGitTouchedFiles(workspace.path);
  if (changed.length) await recordFilesTouched(workspace.path, taskId, changed);

  const checkpoint = await createCheckpoint(workspace.path, taskId, {
    reason: "manual_switch",
    agentSessionId: entry?.agentSessionId,
    agent: task.activeAgent,
    terminalTail: entry?.outputTail,
  });
  await emit(taskId, "checkpoint", `Đã tạo Checkpoint ${checkpoint.name} trước khi chuyển Agent.`, task.activeAgent);

  await stopRuntime(taskId, true);
  await setTaskStatus(taskId, "handoff");
  await emit(taskId, "routing", `Người dùng chọn chuyển sang ${AGENT_DISPLAY_NAMES[agent]}.`, agent);
  await timeline(taskId, `Chuyển sang ${AGENT_DISPLAY_NAMES[agent]}`, "Thủ công");
  await launchAgent(taskId, agent, { fresh: false, resumeFrom: task.activeAgent as AgentId });
}

export function getRuntimeEntry(taskId: string) {
  return runtime.get(taskId);
}

export function getRuntimeSummary(taskId: string) {
  const entry = runtime.get(taskId);
  if (!entry) return null;
  return {
    agent: entry.agent,
    terminalId: entry.terminalId,
    accountId: entry.accountId,
    real: entry.real,
    simulated: !entry.real,
  };
}

export async function cleanupTaskTerminals(taskId: string) {
  const entry = runtime.get(taskId);
  if (entry?.terminalId) disposeSession(entry.terminalId);
  await stopRuntime(taskId, true);
}

export { getAllUsage };
