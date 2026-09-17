import { resizeSession } from "@/lib/terminal";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { cols, rows } = body as { cols: number; rows: number };
  if (!cols || !rows) return Response.json({ error: "MISSING_DIMENSIONS" }, { status: 400 });
  resizeSession(id, cols, rows);
  return Response.json({ ok: true });
}
