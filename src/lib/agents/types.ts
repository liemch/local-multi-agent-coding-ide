export type AgentId = "codex" | "claude" | "antigravity";

export const AGENT_IDS: AgentId[] = ["codex", "claude", "antigravity"];

export const AGENT_BINARIES: Record<AgentId, string> = {
  codex: "codex",
  claude: "claude",
  antigravity: "antigravity",
};

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

export interface AgentUsage {
  status: UsageStatus;
  percentageUsed?: number;
  remaining?: number;
  resetAt?: string;
  source: "cli" | "api" | "local_estimate" | "error_detection";
}

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
