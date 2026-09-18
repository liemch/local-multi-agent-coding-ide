import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Local-first schema (SQLite) — plan §45.
 * Timestamps are stored as unix epoch milliseconds (integer) and mapped to Date.
 * JSON-ish values are stored as TEXT with { mode: "json" }.
 */

const now = sql`(unixepoch() * 1000)`;

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  gitRepository: integer("git_repository", { mode: "boolean" }).notNull().default(false),
  branch: text("branch"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  lastOpenedAt: integer("last_opened_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  mode: text("mode").notNull().default("implement"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("draft"),
  preferredAgent: text("preferred_agent"),
  activeAgent: text("active_agent"),
  activeProviderAccountId: text("active_provider_account_id"),
  branch: text("branch"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  binaryPath: text("binary_path"),
  version: text("version"),
  installed: integer("installed", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
});

export const providerAccounts = sqliteTable("provider_accounts", {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(0),
  status: text("status").notNull().default("unknown"),
  percentageUsed: integer("percentage_used"),
  remaining: integer("remaining"),
  resetAt: integer("reset_at", { mode: "timestamp_ms" }),
  source: text("source").notNull().default("unknown"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  agent: text("agent").notNull(),
  providerAccountId: text("provider_account_id"),
  providerSessionId: text("provider_session_id"),
  terminalId: text("terminal_id"),
  status: text("status").notNull().default("running"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().default(now),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
});

export const checkpoints = sqliteTable("checkpoints", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  agentSessionId: text("agent_session_id"),
  name: text("name").notNull().default(""),
  path: text("path").notNull(),
  gitHead: text("git_head"),
  reason: text("reason").notNull().default("manual"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const agentEvents = sqliteTable("agent_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  agent: text("agent"),
  type: text("type").notNull(),
  message: text("message").notNull(),
  meta: text("meta", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const terminalSessions = sqliteTable("terminal_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  type: text("type").notNull(),
  agent: text("agent"),
  taskId: text("task_id"),
  cwd: text("cwd").notNull(),
  pid: integer("pid"),
  status: text("status").notNull().default("running"),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const usageSnapshots = sqliteTable("usage_snapshots", {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  providerAccountId: text("provider_account_id"),
  status: text("status").notNull().default("unknown"),
  percentageUsed: integer("percentage_used"),
  remaining: integer("remaining"),
  resetAt: integer("reset_at", { mode: "timestamp_ms" }),
  source: text("source").notNull().default("unknown"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("global"),
  locale: text("locale").notNull().default("vi"),
  routingMode: text("routing_mode").notNull().default("smart"),
  agentPriority: text("agent_priority", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default(["codex", "claude", "antigravity"]),
  warningThreshold: integer("warning_threshold").notNull().default(85),
  autoHandoff: integer("auto_handoff", { mode: "boolean" }).notNull().default(true),
  preemptiveHandoff: integer("preemptive_handoff", { mode: "boolean" }).notNull().default(true),
  simulateWhenMissing: integer("simulate_when_missing", { mode: "boolean" }).notNull().default(true),
  permissionMode: text("permission_mode").notNull().default("balanced"),
  autoCreateBranch: integer("auto_create_branch", { mode: "boolean" }).notNull().default(false),
  alwaysAllowCommands: text("always_allow_commands", { mode: "json" }).notNull().$type<string[]>().default([]),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const taskTimeline = sqliteTable("task_timeline", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  label: text("label").notNull(),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  taskId: text("task_id"),
  kind: text("kind").notNull(), // "command" | "sensitive_file"
  subject: text("subject").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | allowed | denied
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
});
