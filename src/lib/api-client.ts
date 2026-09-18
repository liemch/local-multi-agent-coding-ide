"use client";

/** Thin fetch wrapper. All browser calls use relative URLs. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  if (!response.ok) {
    const message = (data as { error?: string })?.error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T,>(url: string, body?: unknown) => request<T>(url, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T,>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T,>(url: string) => request<T>(url, { method: "DELETE" }),
};

export interface AgentUsageView {
  status: "available" | "warning" | "rate_limited" | "quota_exhausted" | "unknown";
  percentageUsed?: number;
  remaining?: number;
  resetAt?: string;
  source: string;
}

export interface ProviderAccountView {
  id: string;
  agent: string;
  provider: string;
  name: string;
  priority: number;
  status: string;
  percentageUsed: number | null;
  remaining: number | null;
  resetAt: string | null;
  source: string;
  enabled: boolean;
}

export interface AgentView {
  id: "codex" | "claude" | "antigravity";
  name: string;
  installed: boolean;
  enabled: boolean;
  version: string | null;
  binaryPath: string | null;
  usage: AgentUsageView;
  accounts: ProviderAccountView[];
  runningTasks: number;
}

export interface TaskView {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  mode: string;
  priority: string;
  status: string;
  preferredAgent: string | null;
  activeAgent: string | null;
  branch: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TimelineEntry {
  id: string;
  taskId: string;
  label: string;
  detail: string | null;
  createdAt: string;
}

export interface CheckpointView {
  id: string;
  taskId: string;
  name: string;
  path: string;
  gitHead: string | null;
  reason: string;
  createdAt: string;
}

export interface AgentEventView {
  taskId: string;
  type: string;
  message: string;
  agent?: string | null;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export interface GitFileStatus {
  path: string;
  index: string;
  worktree: string;
  code: string;
}

export interface TerminalSessionView {
  id: string;
  workspaceId: string;
  type: "shell" | "agent" | "dev-server";
  title: string;
  cwd: string;
  status: "running" | "stopped" | "exited";
  pid?: number;
  backend: string;
  agent?: string;
  taskId?: string;
}
