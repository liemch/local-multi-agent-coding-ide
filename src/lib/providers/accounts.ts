import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { providerAccounts } from "@/db/schema";
import { AGENT_DISPLAY_NAMES, type AgentId, type AgentUsage, type UsageStatus } from "../agents/types";

/**
 * Provider Gateway — account layer (plan §16, §17, §18 tier 1).
 * Holds no task context; only accounts, quota state and health.
 */

export type AccountStatus =
  | "available"
  | "warning"
  | "rate_limited"
  | "exhausted"
  | "disabled"
  | "unknown";

export interface ProviderAccountView {
  id: string;
  agent: AgentId;
  provider: string;
  name: string;
  priority: number;
  status: AccountStatus;
  percentageUsed: number | null;
  remaining: number | null;
  resetAt: Date | null;
  source: string;
  enabled: boolean;
}

/** Every agent gets a default account so routing works out of the box. */
export async function ensureDefaultAccounts(agentIds: AgentId[]): Promise<void> {
  for (const agent of agentIds) {
    const existing = await db.select().from(providerAccounts).where(eq(providerAccounts.agent, agent));
    if (existing.length) continue;
    await db.insert(providerAccounts).values({
      id: randomUUID(),
      agent,
      provider: agent,
      name: `${AGENT_DISPLAY_NAMES[agent]} #1`,
      priority: 0,
      status: "unknown",
      source: "unknown",
      enabled: true,
    });
  }
}

export async function listAccounts(agent?: AgentId): Promise<ProviderAccountView[]> {
  const rows = agent
    ? await db.select().from(providerAccounts).where(eq(providerAccounts.agent, agent)).orderBy(asc(providerAccounts.priority))
    : await db.select().from(providerAccounts).orderBy(asc(providerAccounts.agent), asc(providerAccounts.priority));

  return rows.map((row) => ({
    id: row.id,
    agent: row.agent as AgentId,
    provider: row.provider,
    name: row.name,
    priority: row.priority,
    status: row.status as AccountStatus,
    percentageUsed: row.percentageUsed,
    remaining: row.remaining,
    resetAt: row.resetAt,
    source: row.source,
    enabled: row.enabled,
  }));
}

export async function createAccount(input: {
  agent: AgentId;
  name: string;
  provider?: string;
  priority?: number;
}): Promise<ProviderAccountView> {
  const [row] = await db
    .insert(providerAccounts)
    .values({
      id: randomUUID(),
      agent: input.agent,
      provider: input.provider ?? input.agent,
      name: input.name,
      priority: input.priority ?? 0,
      status: "unknown",
      source: "unknown",
      enabled: true,
    })
    .returning();

  return {
    id: row.id,
    agent: row.agent as AgentId,
    provider: row.provider,
    name: row.name,
    priority: row.priority,
    status: row.status as AccountStatus,
    percentageUsed: row.percentageUsed,
    remaining: row.remaining,
    resetAt: row.resetAt,
    source: row.source,
    enabled: row.enabled,
  };
}

export async function deleteAccount(id: string): Promise<void> {
  await db.delete(providerAccounts).where(eq(providerAccounts.id, id));
}

export async function setAccountEnabled(id: string, enabled: boolean): Promise<void> {
  await db.update(providerAccounts).set({ enabled }).where(eq(providerAccounts.id, id));
}

function accountStatusFromUsage(usage: AgentUsage, warningThreshold: number): AccountStatus {
  switch (usage.status) {
    case "quota_exhausted":
      return "exhausted";
    case "rate_limited":
      return "rate_limited";
    case "warning":
      return "warning";
    case "available":
      if (typeof usage.percentageUsed === "number" && usage.percentageUsed >= warningThreshold) {
        return "warning";
      }
      return "available";
    default:
      return "unknown";
  }
}

export async function applyUsageToAccount(
  accountId: string,
  usage: AgentUsage,
  warningThreshold = 85,
): Promise<void> {
  await db
    .update(providerAccounts)
    .set({
      status: accountStatusFromUsage(usage, warningThreshold),
      percentageUsed: usage.percentageUsed ?? null,
      remaining: usage.remaining ?? null,
      resetAt: usage.resetAt ? new Date(usage.resetAt) : null,
      source: usage.source,
    })
    .where(eq(providerAccounts.id, accountId));
}

export async function markAccountStatus(accountId: string, status: AccountStatus): Promise<void> {
  await db.update(providerAccounts).set({ status }).where(eq(providerAccounts.id, accountId));
}

const UNUSABLE: AccountStatus[] = ["exhausted", "rate_limited", "disabled"];

export function isAccountUsable(account: ProviderAccountView): boolean {
  return account.enabled && !UNUSABLE.includes(account.status);
}

/**
 * Tier-1 routing: pick the next usable account for an agent (plan §18).
 * Lower `priority` wins; ties break on lower usage. Accounts whose rate-limit
 * window has already elapsed are treated as usable again.
 */
export function selectAccount(
  accounts: ProviderAccountView[],
  opts: { exclude?: string[]; now?: Date } = {},
): ProviderAccountView | null {
  const exclude = new Set(opts.exclude ?? []);
  const now = opts.now ?? new Date();

  const candidates = accounts
    .filter((account) => !exclude.has(account.id))
    .filter((account) => {
      if (!account.enabled) return false;
      if (account.status === "rate_limited" && account.resetAt && account.resetAt <= now) return true;
      if (account.status === "exhausted" && account.resetAt && account.resetAt <= now) return true;
      return isAccountUsable(account);
    });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aUsed = a.percentageUsed ?? -1;
    const bUsed = b.percentageUsed ?? -1;
    return aUsed - bUsed;
  });

  return candidates[0];
}

/** Aggregates account states into one agent-level usage status (plan §19). */
export function aggregateAgentUsage(accounts: ProviderAccountView[]): AgentUsage {
  const usable = accounts.filter((account) => account.enabled);
  if (!usable.length) return { status: "unknown", source: "unknown" };

  const active = usable.filter(isAccountUsable);
  if (!active.length) {
    const anyRateLimited = usable.some((a) => a.status === "rate_limited");
    return {
      status: anyRateLimited ? "rate_limited" : "quota_exhausted",
      source: "error_detection",
    };
  }

  const withPercentage = active.filter((a) => typeof a.percentageUsed === "number");
  if (!withPercentage.length) {
    const status: UsageStatus = active.some((a) => a.status === "warning") ? "warning" : "available";
    // No real number available anywhere: report status only, never a fake number.
    return { status, source: active[0].source === "unknown" ? "unknown" : (active[0].source as AgentUsage["source"]) };
  }

  const best = withPercentage.reduce((min, a) =>
    (a.percentageUsed ?? 100) < (min.percentageUsed ?? 100) ? a : min,
  );

  return {
    status: best.status === "warning" ? "warning" : "available",
    percentageUsed: best.percentageUsed ?? undefined,
    remaining: best.remaining ?? undefined,
    resetAt: best.resetAt?.toISOString(),
    source: (best.source as AgentUsage["source"]) ?? "unknown",
  };
}
