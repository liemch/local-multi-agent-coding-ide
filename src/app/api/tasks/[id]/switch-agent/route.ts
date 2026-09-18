import { manualSwitchAgent } from "@/lib/orchestrator/engine";
import { AGENT_IDS, type AgentId } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { agent?: AgentId };
  if (!body.agent || !AGENT_IDS.includes(body.agent)) {
    return Response.json({ error: "MISSING_AGENT" }, { status: 400 });
  }
  await manualSwitchAgent(id, body.agent);
  return Response.json({ ok: true });
}
