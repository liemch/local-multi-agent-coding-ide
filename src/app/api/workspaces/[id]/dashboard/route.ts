import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskTimeline, workspaces } from "@/db/schema";
import { gitStatus, isGitRepository, getCurrentBranch } from "@/lib/git";
import { readLastTestResult } from "@/lib/context";
import { AGENT_IDS, UNKNOWN_USAGE } from "@/lib/agents/types";
import { getAdapter } from "@/lib/agents/adapters";
import { getUsage } from "@/lib/orchestrator/usage";
import { aggregateAgentUsage, ensureDefaultAccounts, listAccounts } from "@/lib/providers/accounts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wsRows = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!wsRows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const workspace = wsRows[0];

  const allTasks = await db.select().from(tasks).where(eq(tasks.workspaceId, id)).orderBy(desc(tasks.createdAt));
  const runningTasks = allTasks.filter((t) =>
    ["running", "checkpointing", "handoff", "preparing"].includes(t.status),
  );

  const taskIds = allTasks.map((t) => t.id);
  const recentActivity = taskIds.length
    ? await db
        .select()
        .from(taskTimeline)
        .where(inArray(taskTimeline.taskId, taskIds))
        .orderBy(desc(taskTimeline.createdAt))
        .limit(20)
    : [];

  const isRepo = await isGitRepository(workspace.path);
  const status = isRepo ? await gitStatus(workspace.path) : null;
  const branch = isRepo ? await getCurrentBranch(workspace.path) : null;

  const latestTask = allTasks[0];
  const testResult = latestTask ? await readLastTestResult(workspace.path, latestTask.id) : null;

  await ensureDefaultAccounts(AGENT_IDS);
  const agentStates = await Promise.all(
    AGENT_IDS.map(async (agentId) => {
      const health = await getAdapter(agentId).health();
      const accounts = await listAccounts(agentId);
      const live = getUsage(agentId);
      return {
        id: agentId,
        installed: health.installed,
        version: health.version ?? null,
        usage: !health.installed ? UNKNOWN_USAGE : live.status === "unknown" ? aggregateAgentUsage(accounts) : live,
        accounts,
        running: runningTasks.filter((t) => t.activeAgent === agentId).length,
      };
    }),
  );

  return Response.json({
    workspace: { ...workspace, branch: branch ?? workspace.branch },
    tasks: allTasks,
    runningTasks,
    recentActivity,
    git: status ? { branch, dirty: status.dirty, changedFiles: status.files.length, files: status.files } : null,
    agents: agentStates,
    testResult,
  });
}
