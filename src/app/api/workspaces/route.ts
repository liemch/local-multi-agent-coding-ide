import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { isGitRepository, getCurrentBranch } from "@/lib/git";
import { ensureSampleProject, validateWorkspacePath } from "@/lib/workspace";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(workspaces).orderBy(desc(workspaces.lastOpenedAt));
  return Response.json({ workspaces: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let targetPath: string = body.path;

  if (body.useSample) {
    targetPath = await ensureSampleProject();
  }

  if (!targetPath || typeof targetPath !== "string") {
    return Response.json({ error: "MISSING_PATH" }, { status: 400 });
  }

  const resolved = path.resolve(targetPath.trim());
  const validation = await validateWorkspacePath(resolved);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const existing = await db.select().from(workspaces).where(eq(workspaces.path, resolved));
  const gitRepository = await isGitRepository(resolved);
  const branch = gitRepository ? await getCurrentBranch(resolved) : null;

  if (existing.length) {
    const [updated] = await db
      .update(workspaces)
      .set({ lastOpenedAt: new Date(), gitRepository, branch })
      .where(eq(workspaces.id, existing[0].id))
      .returning();
    return Response.json({ workspace: updated });
  }

  const [created] = await db
    .insert(workspaces)
    .values({
      id: randomUUID(),
      name: path.basename(resolved) || resolved,
      path: resolved,
      gitRepository,
      branch,
    })
    .returning();

  return Response.json({ workspace: created });
}
