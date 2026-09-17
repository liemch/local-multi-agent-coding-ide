import { db } from "@/db";
import { usageSnapshots } from "@/db/schema";
import { randomUUID } from "node:crypto";
import type { AgentId, AgentUsage, UsageStatus } from "../agents/types";

const globalStore = globalThis as typeof globalThis & {
  __ideAgentUsage?: Map<AgentId, AgentUsage>;
  __ideAgentFailures?: Map<AgentId, number>;
};

const usageMap = globalStore.__ideAgentUsage ?? new Map<AgentId, AgentUsage>();
globalStore.__ideAgentUsage = usageMap;

const failureMap = globalStore.__ideAgentFailures ?? new Map<AgentId, number>();
globalStore.__ideAgentFailures = failureMap;

export function getUsage(agent: AgentId): AgentUsage {
  return usageMap.get(agent) ?? { status: "unknown", source: "unknown" as AgentUsage["source"] };
}

export function getAllUsage(): Record<AgentId, AgentUsage> {
  return {
    codex: getUsage("codex"),
    claude: getUsage("claude"),
    antigravity: getUsage("antigravity"),
  };
}

export function getFailureCount(agent: AgentId): number {
  return failureMap.get(agent) ?? 0;
}

export function recordFailure(agent: AgentId) {
  failureMap.set(agent, (failureMap.get(agent) ?? 0) + 1);
}

export function resetFailures(agent: AgentId) {
  failureMap.set(agent, 0);
}

export async function setUsage(agent: AgentId, usage: AgentUsage) {
  usageMap.set(agent, usage);
  await db.insert(usageSnapshots).values({
    id: randomUUID(),
    agent,
    status: usage.status,
    percentageUsed: usage.percentageUsed ?? null,
    remaining: usage.remaining ?? null,
    resetAt: usage.resetAt ? new Date(usage.resetAt) : null,
    source: usage.source,
  });
}

export function statusFromReason(reason: string): UsageStatus {
  if (reason === "quota_exhausted") return "quota_exhausted";
  if (reason === "rate_limit") return "rate_limited";
  return "unknown";
}
