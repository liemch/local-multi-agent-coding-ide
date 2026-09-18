import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, tasks } from "@/db/schema";
import { getAdapter } from "@/lib/agents/adapters";
import { AGENT_DISPLAY_NAMES, AGENT_IDS, UNKNOWN_USAGE, type AgentId } from "@/lib/agents/types";
import { getUsage } from "@/lib/orchestrator/usage";
import { aggregateAgentUsage, ensureDefaultAccounts, listAccounts } from "@/lib/providers/accounts";
import { clearDetectionCache } from "@/lib/agents/detect";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("refresh") === "1") clearDetectionCache();

  await ensureDefaultAccounts(AGENT_IDS);
  const runningTasks = await db.select().from(tasks).where(eq(tasks.status, "running"));

  const result = await Promise.all(
    AGENT_IDS.map(async (id: AgentId) => {
      const adapter = getAdapter(id);
      const health = await adapter.health();

      const rows = await db.select().from(agents).where(eq(agents.id, id));
      const existing = rows[0];
      const values = {
        id,
        name: AGENT_DISPLAY_NAMES[id],
        binaryPath: health.binaryPath ?? null,
        version: health.version ?? null,
        installed: health.installed,
        enabled: existing?.enabled ?? true,
        lastCheckedAt: new Date(),
      };
      if (existing) {
        await db.update(agents).set(values).where(eq(agents.id, id));
      } else {
        await db.insert(agents).values(values);
      }

      const accounts = await listAccounts(id);
      const live = getUsage(id);
      // An agent we cannot even find on disk has no honest usage reading.
      const usage = !health.installed
        ? UNKNOWN_USAGE
        : live.status === "unknown"
          ? aggregateAgentUsage(accounts)
          : live;

      return {
        id,
        name: AGENT_DISPLAY_NAMES[id],
        installed: health.installed,
        enabled: values.enabled,
        version: health.version ?? null,
        binaryPath: health.binaryPath ?? null,
        usage,
        accounts,
        runningTasks: runningTasks.filter((t) => t.activeAgent === id).length,
      };
    }),
  );

  return Response.json({ agents: result });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: AgentId; enabled?: boolean };
  if (!body.id || typeof body.enabled !== "boolean") {
    return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }
  await db.update(agents).set({ enabled: body.enabled }).where(eq(agents.id, body.id));
  return Response.json({ ok: true });
}
