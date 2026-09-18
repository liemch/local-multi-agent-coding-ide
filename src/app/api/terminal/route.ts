import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, terminalSessions } from "@/db/schema";
import { createTerminalSession, listSessions, ptyBackend } from "@/lib/terminal";
import { assertInsideWorkspace } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId") ?? undefined;
  return Response.json({ sessions: listSessions(workspaceId), backend: ptyBackend() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: string;
    type?: "shell" | "agent" | "dev-server";
    title?: string;
    cwdRelative?: string;
    command?: string;
    args?: string[];
  };

  if (!body.workspaceId) return Response.json({ error: "MISSING_WORKSPACE" }, { status: 400 });
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, body.workspaceId));
  if (!rows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const workspace = rows[0];

  // Terminals may never start outside the workspace (rule #13).
  let cwd = workspace.path;
  if (body.cwdRelative) {
    try {
      cwd = assertInsideWorkspace(workspace.path, `${workspace.path}/${body.cwdRelative}`);
    } catch {
      return Response.json({ error: "PATH_OUTSIDE_WORKSPACE" }, { status: 403 });
    }
  }

  const defaultTitle =
    body.type === "dev-server" ? "Máy chủ phát triển" : body.type === "agent" ? "Agent" : "Shell";

  const meta = createTerminalSession({
    workspaceId: workspace.id,
    type: body.type ?? "shell",
    cwd,
    title: body.title ?? defaultTitle,
    command: body.command,
    args: body.args,
  });

  await db.insert(terminalSessions).values({
    id: meta.id,
    workspaceId: workspace.id,
    type: meta.type,
    cwd: meta.cwd,
    pid: meta.pid,
    status: meta.status,
    title: meta.title,
  });

  return Response.json({ session: meta });
}
