import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { readFileTree } from "@/lib/workspace";
import { gitStatus, isGitRepository } from "@/lib/git";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return Response.json({ error: "MISSING_WORKSPACE" }, { status: 400 });

  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!rows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const root = rows[0].path;

  const tree = await readFileTree(root);

  // Git indicators for the explorer (plan §11).
  let gitStatusMap: Record<string, string> = {};
  if (await isGitRepository(root)) {
    const status = await gitStatus(root);
    gitStatusMap = Object.fromEntries(status.files.map((file) => [file.path, file.code]));
  }

  return Response.json({ tree, gitStatus: gitStatusMap });
}
