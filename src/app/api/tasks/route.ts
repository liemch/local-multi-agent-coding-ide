import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tasks, workspaces } from "@/db/schema";
import { initTaskContext, setTodo } from "@/lib/context";
import { startTask } from "@/lib/orchestrator/engine";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  mode: z.enum(["plan", "implement", "fix", "review"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  preferredAgent: z.enum(["auto", "codex", "claude", "antigravity"]).optional(),
  todo: z.array(z.string()).optional(),
  start: z.boolean().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return Response.json({ error: "MISSING_WORKSPACE" }, { status: 400 });
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId))
    .orderBy(desc(tasks.createdAt));
  return Response.json({ tasks: rows });
}

/** Sequential, human-readable task ids: TASK-001, TASK-002, ... */
async function nextTaskId(workspaceId: string): Promise<string> {
  const existing = await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId));
  let max = 0;
  for (const row of existing) {
    const match = row.id.match(/TASK-(\d+)/);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return `TASK-${String(max + 1).padStart(3, "0")}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_BODY", details: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const wsRows = await db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId));
  if (!wsRows.length) return Response.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });

  const id = await nextTaskId(input.workspaceId);

  const [task] = await db
    .insert(tasks)
    .values({
      id,
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description ?? "",
      mode: input.mode ?? "implement",
      priority: input.priority ?? "normal",
      preferredAgent: input.preferredAgent ?? "auto",
      status: input.start ? "queued" : "draft",
    })
    .returning();

  await initTaskContext(wsRows[0].path, {
    id: task.id,
    title: task.title,
    description: task.description,
    mode: task.mode,
    preferredAgent: task.preferredAgent,
  });

  if (input.todo?.length) {
    await setTodo(wsRows[0].path, task.id, input.todo);
  }

  if (input.start) {
    // Fire and forget: the UI follows progress over SSE.
    void startTask(id).catch((error) => console.error("startTask failed", error));
  }

  return Response.json({ task });
}
