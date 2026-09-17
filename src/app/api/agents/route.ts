import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, tasks } from "@/db/schema";
import { detectAllAgents } from "@/lib/agents/detect";
import { AGENT_DISPLAY_NAMES, AGENT_IDS } from "@/lib/agents/types";
import { getAllUsage } from "@/lib/orchestrator/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  const detected = await detectAllAgents();
  const usage = getAllUsage();
  const runningTasks = await db.select().from(tasks).where(eq(tasks.status, "running"));

  const result = await Promise.all(
    AGENT_IDS.map(async (id) => {
      const health = detected[id];
      await db
        .insert(agents)
        .values({
          id,
          name: AGENT_DISPLAY_NAMES[id],
          binaryPath: health.binaryPath,
          version: health.version,
          installed: health.installed,
          lastCheckedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: agents.id,
          set: {
            binaryPath: health.binaryPath,
            version: health.version,
            installed: health.installed,
            lastCheckedAt: new Date(),
          },
        });
      return {
        id,
        name: AGENT_DISPLAY_NAMES[id],
        installed: health.installed,
        version: health.version,
        binaryPath: health.binaryPath,
        usage: usage[id],
        runningTasks: runningTasks.filter((t) => t.activeAgent === id).length,
      };
    }),
  );

  return Response.json({ agents: result });
}
