import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { AGENT_IDS, type AgentId } from "../agents/types";
import type { RoutingMode } from "../routing";
import type { PermissionMode } from "../security-shared";

export interface IdeSettings {
  id: string;
  locale: string;
  routingMode: RoutingMode;
  agentPriority: AgentId[];
  warningThreshold: number;
  autoHandoff: boolean;
  preemptiveHandoff: boolean;
  simulateWhenMissing: boolean;
  permissionMode: PermissionMode;
  autoCreateBranch: boolean;
  alwaysAllowCommands: string[];
}

export async function getSettings(): Promise<IdeSettings> {
  const rows = await db.select().from(settings).where(eq(settings.id, "global"));
  let row = rows[0];
  if (!row) {
    const inserted = await db.insert(settings).values({ id: "global" }).returning();
    row = inserted[0];
  }

  const priority = Array.isArray(row.agentPriority) ? (row.agentPriority as AgentId[]) : AGENT_IDS;

  return {
    id: row.id,
    locale: row.locale,
    routingMode: row.routingMode as RoutingMode,
    agentPriority: priority.filter((id): id is AgentId => AGENT_IDS.includes(id as AgentId)),
    warningThreshold: row.warningThreshold,
    autoHandoff: row.autoHandoff,
    preemptiveHandoff: row.preemptiveHandoff,
    simulateWhenMissing: row.simulateWhenMissing,
    permissionMode: row.permissionMode as PermissionMode,
    autoCreateBranch: row.autoCreateBranch,
    alwaysAllowCommands: Array.isArray(row.alwaysAllowCommands) ? (row.alwaysAllowCommands as string[]) : [],
  };
}

export async function updateSettings(patch: Partial<Omit<IdeSettings, "id">>): Promise<IdeSettings> {
  await getSettings();
  await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, "global"));
  return getSettings();
}
