import { triggerFailure } from "@/lib/orchestrator/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = (body?.reason as string) ?? "quota_exhausted";
  await triggerFailure(id, reason);
  return Response.json({ ok: true });
}
