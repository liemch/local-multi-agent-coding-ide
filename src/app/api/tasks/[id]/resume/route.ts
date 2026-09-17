import { resumeTask } from "@/lib/orchestrator/engine";
import type { AgentId } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { agent?: AgentId | "auto" };
  await resumeTask(id, body.agent);
  return Response.json({ ok: true });
}
