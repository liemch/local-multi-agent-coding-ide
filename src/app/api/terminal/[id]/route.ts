import { eq } from "drizzle-orm";
import { db } from "@/db";
import { terminalSessions } from "@/db/schema";
import { killSession } from "@/lib/terminal";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  killSession(id);
  await db.update(terminalSessions).set({ status: "stopped" }).where(eq(terminalSessions.id, id));
  return Response.json({ ok: true });
}
