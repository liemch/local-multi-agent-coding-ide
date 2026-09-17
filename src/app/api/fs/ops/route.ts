import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { resolveWorkspaceFile } from "@/lib/workspace";

export const dynamic = "force-dynamic";

async function getWorkspace(workspaceId: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return rows[0] ?? null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workspaceId, action, targetPath, newPath, isDirectory } = body as {
    workspaceId: string;
    action: "create" | "rename" | "delete" | "mkdir";
    targetPath: string;
    newPath?: string;
    isDirectory?: boolean;
  };
  if (!workspaceId || !action || !targetPath) {
    return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const abs = resolveWorkspaceFile(workspace.path, targetPath);
    if (action === "create") {
      if (isDirectory) {
        await fs.mkdir(abs, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, "", { flag: "wx" });
      }
    } else if (action === "mkdir") {
      await fs.mkdir(abs, { recursive: true });
    } else if (action === "rename") {
      if (!newPath) return Response.json({ error: "MISSING_NEW_PATH" }, { status: 400 });
      const newAbs = resolveWorkspaceFile(workspace.path, newPath);
      await fs.rename(abs, newAbs);
    } else if (action === "delete") {
      await fs.rm(abs, { recursive: true, force: true });
    } else {
      return Response.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "PATH_OUTSIDE_WORKSPACE") {
      return Response.json({ error: "PATH_OUTSIDE_WORKSPACE" }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "OPERATION_FAILED", message }, { status: 500 });
  }
}
