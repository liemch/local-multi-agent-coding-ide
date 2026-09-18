import { handBackTask } from "@/lib/orchestrator/engine";
import { AGENT_IDS, type AgentId } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { agent?: string };
  const choice = body.agent ?? "auto";
  if (choice !== "auto" && !AGENT_IDS.includes(choice as AgentId)) {
    return Response.json({ error: "INVALID_AGENT" }, { status: 400 });
  }
  await handBackTask(id, choice as AgentId | "auto");
  return Response.json({ ok: true });
}
