import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  gitRepository: boolean("git_repository").notNull().default(false),
  branch: text("branch"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  binaryPath: text("binary_path"),
  version: text("version"),
  installed: boolean("installed").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
});

export const providerAccounts = pgTable("provider_accounts", {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(0),
  status: text("status").notNull().default("unknown"),
  percentageUsed: integer("percentage_used"),
  remaining: integer("remaining"),
  resetAt: timestamp("reset_at", { withTimezone: true }),
  source: text("source").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentSessions = pgTable("agent_sessions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  agent: text("agent").notNull(),
  providerAccountId: text("provider_account_id"),
  providerSessionId: text("provider_session_id"),
  terminalId: text("terminal_id"),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const checkpoints = pgTable("checkpoints", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  agentSessionId: text("agent_session_id"),
  path: text("path").notNull(),
  gitHead: text("git_head"),
  reason: text("reason").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentEvents = pgTable("agent_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  agent: text("agent"),
  type: text("type").notNull(),
  message: text("message").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const terminalSessions = pgTable("terminal_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  type: text("type").notNull(),
  agent: text("agent"),
  taskId: text("task_id"),
  cwd: text("cwd").notNull(),
  pid: integer("pid"),
  status: text("status").notNull().default("running"),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageSnapshots = pgTable("usage_snapshots", {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  providerAccountId: text("provider_account_id"),
  status: text("status").notNull().default("unknown"),
  percentageUsed: integer("percentage_used"),
  remaining: integer("remaining"),
  resetAt: timestamp("reset_at", { withTimezone: true }),
  source: text("source").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("global"),
  locale: text("locale").notNull().default("vi"),
  routingMode: text("routing_mode").notNull().default("smart"),
  agentPriority: jsonb("agent_priority").notNull().default(["codex", "claude", "antigravity"]),
  warningThreshold: integer("warning_threshold").notNull().default(85),
  autoHandoff: boolean("auto_handoff").notNull().default(true),
  simulateWhenMissing: boolean("simulate_when_missing").notNull().default(true),
  permissionMode: text("permission_mode").notNull().default("balanced"),
  autoCreateBranch: boolean("auto_create_branch").notNull().default(false),
  alwaysAllowCommands: jsonb("always_allow_commands").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskTimeline = pgTable("task_timeline", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  label: text("label").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
