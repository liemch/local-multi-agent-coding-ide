import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskTimeline, workspaces } from "@/db/schema";
import { gitStatus, isGitRepository } from "@/lib/git";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wsRows = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!wsRows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const workspace = wsRows[0];

  const allTasks = await db.select().from(tasks).where(eq(tasks.workspaceId, id)).orderBy(desc(tasks.createdAt));
  const runningTasks = allTasks.filter((t) => ["running", "checkpointing", "handoff"].includes(t.status));
  const taskIds = allTasks.map((t) => t.id);
  const recentActivity = taskIds.length
    ? await db.select().from(taskTimeline).where(inArray(taskTimeline.taskId, taskIds)).orderBy(desc(taskTimeline.createdAt)).limit(20)
    : [];

  const isRepo = await isGitRepository(workspace.path);
  const status = isRepo ? await gitStatus(workspace.path) : null;

  return Response.json({
    workspace,
    tasks: allTasks,
    runningTasks,
    recentActivity,
    git: isRepo ? { branch: status?.branch, changedFiles: status?.files.length ?? 0 } : null,
  });
}
