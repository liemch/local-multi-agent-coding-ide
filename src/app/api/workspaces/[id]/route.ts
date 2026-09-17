import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { isGitRepository, getCurrentBranch } from "@/lib/git";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!rows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const workspace = rows[0];
  const gitRepository = await isGitRepository(workspace.path);
  const branch = gitRepository ? await getCurrentBranch(workspace.path) : null;
  if (gitRepository !== workspace.gitRepository || branch !== workspace.branch) {
    await db.update(workspaces).set({ gitRepository, branch }).where(eq(workspaces.id, id));
  }
  return Response.json({ workspace: { ...workspace, gitRepository, branch } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(workspaces).where(eq(workspaces.id, id));
  return Response.json({ ok: true });
}
