import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { usageSnapshots } from "@/db/schema";
import { AGENT_IDS, UNKNOWN_USAGE, type AgentId, type AgentUsage, type UsageStatus } from "../agents/types";

/**
 * Usage tracking (plan §19, coding rule #8).
 * We only ever store what a provider actually told us. When nothing is known the
 * status stays `unknown` and the UI shows "Không xác định" — never a made-up %.
 */

const globalStore = globalThis as typeof globalThis & {
  __ideAgentUsage?: Map<AgentId, AgentUsage>;
  __ideAgentFailures?: Map<AgentId, number>;
};

const usageMap = globalStore.__ideAgentUsage ?? new Map<AgentId, AgentUsage>();
globalStore.__ideAgentUsage = usageMap;

const failureMap = globalStore.__ideAgentFailures ?? new Map<AgentId, number>();
globalStore.__ideAgentFailures = failureMap;

export function getUsage(agent: AgentId): AgentUsage {
  return usageMap.get(agent) ?? UNKNOWN_USAGE;
}

export function getAllUsage(): Record<AgentId, AgentUsage> {
  return AGENT_IDS.reduce(
    (acc, id) => {
      acc[id] = getUsage(id);
      return acc;
    },
    {} as Record<AgentId, AgentUsage>,
  );
}

export function getFailureCount(agent: AgentId): number {
  return failureMap.get(agent) ?? 0;
}

export function recordFailure(agent: AgentId): number {
  const next = getFailureCount(agent) + 1;
  failureMap.set(agent, next);
  return next;
}

export function resetFailures(agent: AgentId) {
  failureMap.set(agent, 0);
}

export function resetAllUsage() {
  usageMap.clear();
  failureMap.clear();
}

export async function setUsage(agent: AgentId, usage: AgentUsage, providerAccountId?: string | null) {
  usageMap.set(agent, usage);
  await db.insert(usageSnapshots).values({
    id: randomUUID(),
    agent,
    providerAccountId: providerAccountId ?? null,
    status: usage.status,
    percentageUsed: usage.percentageUsed ?? null,
    remaining: usage.remaining ?? null,
    resetAt: usage.resetAt ? new Date(usage.resetAt) : null,
    source: usage.source,
  });
}

/** Applies the warning threshold to a real reading (plan §37). */
export function applyWarningThreshold(usage: AgentUsage, warningThreshold: number): AgentUsage {
  if (usage.status !== "available") return usage;
  if (typeof usage.percentageUsed !== "number") return usage;
  if (usage.percentageUsed < warningThreshold) return usage;
  return { ...usage, status: "warning" };
}

export function statusFromReason(reason: string): UsageStatus {
  if (reason === "quota_exhausted") return "quota_exhausted";
  if (reason === "rate_limit") return "rate_limited";
  if (reason === "provider_unavailable" || reason === "authentication_error") return "unknown";
  return "unknown";
}
