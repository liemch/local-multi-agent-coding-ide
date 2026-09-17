import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, terminalSessions } from "@/db/schema";
import { createTerminalSession, listSessions } from "@/lib/terminal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId") ?? undefined;
  const sessions = listSessions(workspaceId);
  return Response.json({ sessions });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workspaceId, type, title, cwdRelative } = body as {
    workspaceId: string;
    type?: "shell" | "agent" | "dev-server";
    title?: string;
    cwdRelative?: string;
  };
  if (!workspaceId) return Response.json({ error: "MISSING_WORKSPACE" }, { status: 400 });
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!rows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const cwd = cwdRelative ? `${rows[0].path}/${cwdRelative}` : rows[0].path;
  const meta = createTerminalSession({
    workspaceId,
    type: type ?? "shell",
    cwd,
    title: title ?? (type === "dev-server" ? "Máy chủ phát triển" : "Shell"),
  });

  await db.insert(terminalSessions).values({
    id: meta.id,
    workspaceId,
    type: meta.type,
    cwd: meta.cwd,
    pid: meta.pid,
    status: meta.status,
    title: meta.title,
  });

  return Response.json({ session: meta });
}
