import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { resolveWorkspaceFile } from "@/lib/workspace";
import { isSensitiveFile } from "@/lib/security";

export const dynamic = "force-dynamic";

async function getWorkspace(workspaceId: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return rows[0] ?? null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const relPath = searchParams.get("path");
  if (!workspaceId || relPath === null) return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const absPath = resolveWorkspaceFile(workspace.path, relPath);
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) return Response.json({ error: "IS_DIRECTORY" }, { status: 400 });
    const content = await fs.readFile(absPath, "utf-8");
    return Response.json({
      content,
      mtimeMs: stat.mtimeMs,
      sensitive: isSensitiveFile(path.basename(relPath)),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "PATH_OUTSIDE_WORKSPACE") {
      return Response.json({ error: "PATH_OUTSIDE_WORKSPACE" }, { status: 403 });
    }
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workspaceId, path: relPath, content } = body as { workspaceId: string; path: string; content: string };
  if (!workspaceId || !relPath || content === undefined) {
    return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const absPath = resolveWorkspaceFile(workspace.path, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf-8");
    const stat = await fs.stat(absPath);
    return Response.json({ ok: true, mtimeMs: stat.mtimeMs });
  } catch (err) {
    if (err instanceof Error && err.message === "PATH_OUTSIDE_WORKSPACE") {
      return Response.json({ error: "PATH_OUTSIDE_WORKSPACE" }, { status: 403 });
    }
    return Response.json({ error: "WRITE_FAILED" }, { status: 500 });
  }
}
