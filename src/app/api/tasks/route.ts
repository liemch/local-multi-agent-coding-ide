import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, workspaces } from "@/db/schema";
import { initTaskContext } from "@/lib/context";
import { startTask } from "@/lib/orchestrator/engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return Response.json({ error: "MISSING_WORKSPACE" }, { status: 400 });
  const rows = await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId)).orderBy(desc(tasks.createdAt));
  return Response.json({ tasks: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workspaceId, title, description, mode, priority, preferredAgent, start } = body as {
    workspaceId: string;
    title: string;
    description?: string;
    mode?: string;
    priority?: string;
    preferredAgent?: string;
    start?: boolean;
  };
  if (!workspaceId || !title) return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  const wsRows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!wsRows.length) return Response.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });

  const existingCount = (await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId))).length;
  const id = `TASK-${String(existingCount + 1).padStart(3, "0")}`;

  const [task] = await db
    .insert(tasks)
    .values({
      id,
      workspaceId,
      title,
      description: description ?? "",
      mode: mode ?? "implement",
      priority: priority ?? "normal",
      preferredAgent: preferredAgent ?? "auto",
      status: start ? "queued" : "draft",
    })
    .returning();

  await initTaskContext(wsRows[0].path, {
    id: task.id,
    title: task.title,
    description: task.description,
    mode: task.mode,
    preferredAgent: task.preferredAgent,
  });

  if (start) {
    startTask(id).catch((err) => console.error("startTask failed", err));
  }

  return Response.json({ task });
}
