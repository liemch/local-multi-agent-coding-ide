import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { tasks, workspaces, agentSessions, checkpoints, taskTimeline } from "@/db/schema";
import { buildContextPackage } from "@/lib/context";
import { getRuntimeSummary, cleanupTaskTerminals } from "@/lib/orchestrator/engine";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!rows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const task = rows[0];

  const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.id, task.workspaceId));
  const workspace = workspaceRows[0];

  const [sessions, checkpointList, timeline] = await Promise.all([
    db.select().from(agentSessions).where(eq(agentSessions.taskId, id)).orderBy(desc(agentSessions.startedAt)),
    db.select().from(checkpoints).where(eq(checkpoints.taskId, id)).orderBy(desc(checkpoints.createdAt)),
    db.select().from(taskTimeline).where(eq(taskTimeline.taskId, id)).orderBy(desc(taskTimeline.createdAt)),
  ]);

  const context = workspace ? await buildContextPackage(workspace.path, id) : null;

  return Response.json({
    task,
    sessions,
    checkpoints: checkpointList,
    timeline,
    context,
    runtime: getRuntimeSummary(id),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const allowed = ["title", "description", "mode", "priority", "preferredAgent"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  if (!Object.keys(update).length) return Response.json({ error: "NOTHING_TO_UPDATE" }, { status: 400 });
  const [task] = await db.update(tasks).set(update).where(eq(tasks.id, id)).returning();
  return Response.json({ task });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await cleanupTaskTerminals(id);
  await db.delete(tasks).where(eq(tasks.id, id));
  await db.delete(agentSessions).where(eq(agentSessions.taskId, id));
  await db.delete(taskTimeline).where(eq(taskTimeline.taskId, id));
  await db.delete(checkpoints).where(eq(checkpoints.taskId, id));
  return Response.json({ ok: true });
}
