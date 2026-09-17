import { writeToSession } from "@/lib/terminal";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { data } = body as { data: string };
  if (typeof data !== "string") return Response.json({ error: "MISSING_DATA" }, { status: 400 });
  writeToSession(id, data);
  return Response.json({ ok: true });
}
