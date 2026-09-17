import { AGENT_IDS, type AgentId, type FailoverReason, FAILOVER_REASONS, type UsageStatus } from "./agents/types";

export interface AgentRuntimeState {
  id: AgentId;
  installed: boolean;
  enabled: boolean;
  usageStatus: UsageStatus;
  percentageUsed?: number;
  recentFailures: number;
}

export type RoutingMode = "manual" | "priority" | "smart";

export function isFailoverReason(reason: string): reason is FailoverReason {
  return (FAILOVER_REASONS as string[]).includes(reason);
}

/** Errors that must NOT trigger a hard failover: they are task errors, the agent must keep working. */
const TASK_ERROR_KEYWORDS = ["build_failed", "compile_error", "test_failed", "lint_error", "app_bug"];

export function isTaskError(reason: string): boolean {
  return TASK_ERROR_KEYWORDS.includes(reason);
}

function usageHealthScore(state: AgentRuntimeState): number {
  switch (state.usageStatus) {
    case "available":
      return 1;
    case "warning":
      return 0.5;
    case "rate_limited":
      return 0.1;
    case "quota_exhausted":
      return 0;
    default:
      return 0.7; // unknown: assume mostly healthy, no fabricated penalty
  }
}

export function scoreAgent(state: AgentRuntimeState, priorityIndex: number, taskCompatibility = 1): number {
  if (!state.installed || !state.enabled) return -1;
  if (state.usageStatus === "quota_exhausted" || state.usageStatus === "rate_limited") return -1;

  const availability = 1;
  const usageHealth = usageHealthScore(state);
  const recentReliability = Math.max(0, 1 - state.recentFailures * 0.2);
  const userPriority = 1 - priorityIndex * 0.2;

  return (
    availability * 0.35 +
    usageHealth * 0.25 +
    taskCompatibility * 0.2 +
    recentReliability * 0.1 +
    Math.max(0, userPriority) * 0.1
  );
}

export function pickNextAgent(
  states: Record<AgentId, AgentRuntimeState>,
  opts: { mode: RoutingMode; priority: AgentId[]; exclude?: AgentId[]; preferred?: AgentId | null },
): AgentId | null {
  const exclude = new Set(opts.exclude ?? []);
  const candidates = AGENT_IDS.filter((id) => !exclude.has(id));

  if (opts.mode === "manual" && opts.preferred && !exclude.has(opts.preferred)) {
    const state = states[opts.preferred];
    if (state && state.installed && state.enabled && state.usageStatus !== "quota_exhausted") {
      return opts.preferred;
    }
    return null;
  }

  if (opts.mode === "priority") {
    for (const id of opts.priority) {
      if (exclude.has(id)) continue;
      const s = states[id];
      if (s && s.installed && s.enabled && s.usageStatus !== "quota_exhausted" && s.usageStatus !== "rate_limited") {
        return id;
      }
    }
    return null;
  }

  // smart mode
  let best: { id: AgentId; score: number } | null = null;
  for (const id of candidates) {
    const priorityIndex = opts.priority.indexOf(id);
    const score = scoreAgent(states[id], priorityIndex === -1 ? opts.priority.length : priorityIndex);
    if (score < 0) continue;
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id ?? null;
}
