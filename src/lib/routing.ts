import {
  AGENT_IDS,
  FAILOVER_REASONS,
  TASK_ERROR_REASONS,
  type AgentId,
  type FailoverReason,
  type UsageStatus,
} from "./agents/types";

/** Agent Router (plan §34). Rule-based — no AI needed for routing. */

export interface AgentRuntimeState {
  id: AgentId;
  installed: boolean;
  enabled: boolean;
  usageStatus: UsageStatus;
  percentageUsed?: number;
  recentFailures: number;
  /** Whether at least one provider account is currently usable (tier 1). */
  hasUsableAccount: boolean;
}

export type RoutingMode = "manual" | "priority" | "smart";

export type TaskMode = "plan" | "implement" | "fix" | "review";

export function isFailoverReason(reason: string): reason is FailoverReason {
  return (FAILOVER_REASONS as string[]).includes(reason);
}

/** Task errors must never trigger a handoff — plan §36. */
export function isTaskError(reason: string): boolean {
  return (TASK_ERROR_REASONS as string[]).includes(reason);
}

function usageHealthScore(state: AgentRuntimeState): number {
  switch (state.usageStatus) {
    case "available":
      if (typeof state.percentageUsed === "number") {
        return Math.max(0, 1 - state.percentageUsed / 100);
      }
      return 1;
    case "warning":
      return 0.4;
    case "rate_limited":
      return 0.1;
    case "quota_exhausted":
      return 0;
    default:
      // Unknown quota is not a penalty: many CLIs simply do not report it.
      return 0.8;
  }
}

/**
 * Task/agent affinity. Kept deliberately mild (0.8–1.0) so it nudges rather
 * than dominates the decision.
 */
export function taskCompatibility(agent: AgentId, mode?: TaskMode): number {
  if (!mode) return 1;
  const table: Record<TaskMode, Partial<Record<AgentId, number>>> = {
    plan: { claude: 1, codex: 0.9, antigravity: 0.85 },
    implement: { codex: 1, claude: 0.95, antigravity: 0.9 },
    fix: { codex: 1, claude: 0.95, antigravity: 0.9 },
    review: { claude: 1, codex: 0.9, antigravity: 0.85 },
  };
  return table[mode]?.[agent] ?? 0.9;
}

export function isAgentUsable(state: AgentRuntimeState | undefined): boolean {
  if (!state) return false;
  if (!state.installed || !state.enabled) return false;
  if (!state.hasUsableAccount) return false;
  return state.usageStatus !== "quota_exhausted" && state.usageStatus !== "rate_limited";
}

/** Weights come straight from plan §34. */
export function scoreAgent(
  state: AgentRuntimeState,
  priorityIndex: number,
  mode?: TaskMode,
): number {
  if (!isAgentUsable(state)) return -1;

  const availability = 1;
  const usageHealth = usageHealthScore(state);
  const compatibility = taskCompatibility(state.id, mode);
  const recentReliability = Math.max(0, 1 - state.recentFailures * 0.2);
  const userPriority = Math.max(0, 1 - priorityIndex * 0.2);

  return (
    availability * 0.35 +
    usageHealth * 0.25 +
    compatibility * 0.2 +
    recentReliability * 0.1 +
    userPriority * 0.1
  );
}

export interface PickAgentOptions {
  mode: RoutingMode;
  priority: AgentId[];
  exclude?: AgentId[];
  preferred?: AgentId | null;
  taskMode?: TaskMode;
}

/** Tier-2 routing: choose which agent should own the task (plan §18). */
export function pickNextAgent(
  states: Record<AgentId, AgentRuntimeState>,
  opts: PickAgentOptions,
): AgentId | null {
  const exclude = new Set(opts.exclude ?? []);

  if (opts.mode === "manual") {
    if (!opts.preferred || exclude.has(opts.preferred)) return null;
    return isAgentUsable(states[opts.preferred]) ? opts.preferred : null;
  }

  if (opts.mode === "priority") {
    for (const id of opts.priority) {
      if (exclude.has(id)) continue;
      if (isAgentUsable(states[id])) return id;
    }
    // Fall back to any other usable agent not in the priority list.
    for (const id of AGENT_IDS) {
      if (exclude.has(id) || opts.priority.includes(id)) continue;
      if (isAgentUsable(states[id])) return id;
    }
    return null;
  }

  let best: { id: AgentId; score: number } | null = null;
  for (const id of AGENT_IDS) {
    if (exclude.has(id)) continue;
    const priorityIndex = opts.priority.indexOf(id);
    const score = scoreAgent(states[id], priorityIndex === -1 ? opts.priority.length : priorityIndex, opts.taskMode);
    if (score < 0) continue;
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id ?? null;
}

/**
 * Preemptive handoff (plan §37): switch before the wall, but only when we have
 * a real percentage and a genuinely healthier agent to move to.
 */
export function shouldPreemptivelyHandoff(
  current: AgentRuntimeState,
  states: Record<AgentId, AgentRuntimeState>,
  warningThreshold: number,
): boolean {
  if (typeof current.percentageUsed !== "number") return false;
  if (current.percentageUsed < warningThreshold) return false;

  return AGENT_IDS.some((id) => {
    if (id === current.id) return false;
    const candidate = states[id];
    if (!isAgentUsable(candidate)) return false;
    if (typeof candidate.percentageUsed !== "number") return true;
    return candidate.percentageUsed < current.percentageUsed! - 10;
  });
}
