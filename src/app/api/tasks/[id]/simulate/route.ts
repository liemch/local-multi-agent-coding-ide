import { triggerFailure } from "@/lib/orchestrator/engine";
import { FAILOVER_REASONS } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

/** Simulates a provider failure so the failover flow can be exercised (plan §58). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason ?? "quota_exhausted";
  if (!(FAILOVER_REASONS as string[]).includes(reason)) {
    return Response.json({ error: "INVALID_REASON" }, { status: 400 });
  }
  await triggerFailure(id, reason);
  return Response.json({ ok: true });
}
