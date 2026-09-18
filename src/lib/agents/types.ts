export type AgentId = "codex" | "claude" | "antigravity";

export const AGENT_IDS: AgentId[] = ["codex", "claude", "antigravity"];

export const AGENT_DISPLAY_NAMES: Record<AgentId, string> = {
  codex: "Codex",
  claude: "Claude",
  antigravity: "Antigravity",
};

export type UsageStatus =
  | "available"
  | "warning"
  | "rate_limited"
  | "quota_exhausted"
  | "unknown";

/** Where a usage number came from. Never invent one — plan §19, rule #8. */
export type UsageSource = "cli" | "api" | "local_estimate" | "error_detection" | "unknown";

export interface AgentUsage {
  status: UsageStatus;
  percentageUsed?: number;
  remaining?: number;
  resetAt?: string;
  source: UsageSource;
}

export const UNKNOWN_USAGE: AgentUsage = { status: "unknown", source: "unknown" };

export interface AgentHealth {
  installed: boolean;
  version?: string | null;
  binaryPath?: string | null;
  status: "available" | "unavailable";
}

export type FailoverReason =
  | "quota_exhausted"
  | "rate_limit"
  | "provider_unavailable"
  | "authentication_error"
  | "repeated_provider_error";

export const FAILOVER_REASONS: FailoverReason[] = [
  "quota_exhausted",
  "rate_limit",
  "provider_unavailable",
  "authentication_error",
  "repeated_provider_error",
];

/** Task-level errors that must NOT trigger a failover (plan §36). */
export type TaskErrorReason =
  | "build_failed"
  | "compile_error"
  | "test_failed"
  | "lint_error"
  | "app_bug";

export const TASK_ERROR_REASONS: TaskErrorReason[] = [
  "build_failed",
  "compile_error",
  "test_failed",
  "lint_error",
  "app_bug",
];

export type AgentEventType =
  | "activity"
  | "file_change"
  | "test_result"
  | "usage"
  | "provider_error"
  | "task_error"
  | "completed"
  | "output";

export interface AgentEvent {
  type: AgentEventType;
  message: string;
  usage?: AgentUsage;
  /** Set when the adapter recognised a provider failure worth failing over on. */
  failoverReason?: FailoverReason;
  /** Set when the adapter recognised a task error (agent must keep working). */
  taskErrorReason?: TaskErrorReason;
  files?: string[];
  raw?: string;
}

export interface AgentRunInput {
  taskId: string;
  workspaceRoot: string;
  prompt: string;
  /** Extra environment (e.g. credentials selected by the account router). */
  env?: Record<string, string>;
}

export interface AgentResumeInput extends AgentRunInput {
  providerSessionId?: string | null;
}

export interface AgentSession {
  terminalId: string;
  providerSessionId?: string | null;
  /** True when the real CLI was launched; false when the simulator stood in. */
  real: boolean;
}

/**
 * Every CLI must be wrapped in an adapter — plan §14, coding rule #6.
 * No provider-specific strings may leak outside these implementations.
 */
export interface AgentAdapter {
  id: AgentId;
  displayName: string;
  binary: string;

  detect(): Promise<boolean>;
  getVersion(): Promise<string | null>;
  health(): Promise<AgentHealth>;
  /**
   * Usage for this agent. Must return `unknown` rather than a fabricated
   * number when the CLI exposes nothing (plan §19).
   */
  usage(): Promise<AgentUsage>;

  start(input: AgentRunInput): Promise<AgentSession>;
  resume(input: AgentResumeInput): Promise<AgentSession>;
  stop(sessionId: string): Promise<void>;

  /** Parses one chunk of CLI output into a structured event, or null. */
  parseEvent(raw: string): AgentEvent | null;

  /** Builds the argv used to launch the CLI with a prompt. */
  buildArgs(input: AgentRunInput): string[];
}
