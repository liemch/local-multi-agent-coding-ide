import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { gitCommit } from "@/lib/git";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workspaceId, message } = body as { workspaceId: string; message: string };
  if (!workspaceId || !message) return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!rows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const result = await gitCommit(rows[0].path, message);
  return Response.json(result);
}
