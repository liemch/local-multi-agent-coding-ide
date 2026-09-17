import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { gitStatus, isGitRepository } from "@/lib/git";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return Response.json({ error: "MISSING_WORKSPACE" }, { status: 400 });
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!rows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const root = rows[0].path;
  const isRepo = await isGitRepository(root);
  if (!isRepo) return Response.json({ isRepo: false });
  const status = await gitStatus(root);
  return Response.json({ isRepo: true, ...status });
}
