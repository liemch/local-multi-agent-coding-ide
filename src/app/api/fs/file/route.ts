import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { resolveWorkspaceFile } from "@/lib/workspace";
import { isSensitiveFile } from "@/lib/security";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

async function getWorkspace(workspaceId: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return rows[0] ?? null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const relPath = searchParams.get("path");
  const confirmed = searchParams.get("confirmed") === "1";

  if (!workspaceId || relPath === null) return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const absPath = resolveWorkspaceFile(workspace.path, relPath);
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) return Response.json({ error: "IS_DIRECTORY" }, { status: 400 });

    const sensitive = isSensitiveFile(path.basename(relPath));
    // Plan §50: never hand over secrets without an explicit confirmation.
    if (sensitive && !confirmed) {
      return Response.json({
        sensitive: true,
        requiresConfirmation: true,
        content: null,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }

    if (stat.size > MAX_FILE_BYTES) {
      return Response.json({ error: "FILE_TOO_LARGE", size: stat.size }, { status: 413 });
    }

    const content = await fs.readFile(absPath, "utf-8");
    return Response.json({ content, mtimeMs: stat.mtimeMs, size: stat.size, sensitive });
  } catch (error) {
    if (error instanceof Error && error.message === "PATH_OUTSIDE_WORKSPACE") {
      return Response.json({ error: "PATH_OUTSIDE_WORKSPACE" }, { status: 403 });
    }
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: string;
    path?: string;
    content?: string;
  };
  if (!body.workspaceId || !body.path || body.content === undefined) {
    return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }
  const workspace = await getWorkspace(body.workspaceId);
  if (!workspace) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const absPath = resolveWorkspaceFile(workspace.path, body.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, body.content, "utf-8");
    const stat = await fs.stat(absPath);
    return Response.json({ ok: true, mtimeMs: stat.mtimeMs });
  } catch (error) {
    if (error instanceof Error && error.message === "PATH_OUTSIDE_WORKSPACE") {
      return Response.json({ error: "PATH_OUTSIDE_WORKSPACE" }, { status: 403 });
    }
    return Response.json({ error: "WRITE_FAILED" }, { status: 500 });
  }
}
