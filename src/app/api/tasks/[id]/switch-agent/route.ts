import { manualSwitchAgent } from "@/lib/orchestrator/engine";
import type { AgentId } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const agent = body?.agent as AgentId;
  if (!agent) return Response.json({ error: "MISSING_AGENT" }, { status: 400 });
  await manualSwitchAgent(id, agent);
  return Response.json({ ok: true });
}
