import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, workspaces } from "@/db/schema";
import { manualCheckpoint } from "@/lib/orchestrator/engine";
import { listCheckpoints, readCheckpoint, restoreCheckpoint } from "@/lib/checkpoints";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const checkpointId = searchParams.get("checkpointId");

  if (checkpointId) {
    const data = await readCheckpoint(checkpointId);
    if (!data) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json(data);
  }

  const rows = await listCheckpoints(id);
  return Response.json({ checkpoints: rows });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const checkpoint = await manualCheckpoint(id);
    return Response.json({ checkpoint });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

/** Restore context files from a checkpoint (plan Phase 7). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { checkpointId?: string };
  if (!body.checkpointId) return Response.json({ error: "MISSING_CHECKPOINT" }, { status: 400 });

  const taskRows = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!taskRows.length) return Response.json({ error: "TASK_NOT_FOUND" }, { status: 404 });
  const wsRows = await db.select().from(workspaces).where(eq(workspaces.id, taskRows[0].workspaceId));
  if (!wsRows.length) return Response.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });

  const result = await restoreCheckpoint(wsRows[0].path, body.checkpointId);
  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json(result);
}
