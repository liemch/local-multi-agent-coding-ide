import { z } from "zod";
import { getSettings, updateSettings } from "@/lib/orchestrator/settings";
import { AGENT_IDS } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

const agentIdSchema = z.enum(["codex", "claude", "antigravity"]);

const patchSchema = z.object({
  locale: z.enum(["vi", "en"]).optional(),
  routingMode: z.enum(["manual", "priority", "smart"]).optional(),
  agentPriority: z.array(agentIdSchema).optional(),
  warningThreshold: z.number().int().min(1).max(100).optional(),
  autoHandoff: z.boolean().optional(),
  preemptiveHandoff: z.boolean().optional(),
  simulateWhenMissing: z.boolean().optional(),
  permissionMode: z.enum(["safe", "balanced", "auto"]).optional(),
  autoCreateBranch: z.boolean().optional(),
  alwaysAllowCommands: z.array(z.string()).optional(),
});

export async function GET() {
  const settings = await getSettings();
  return Response.json({ settings, agentIds: AGENT_IDS });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_BODY", details: parsed.error.issues }, { status: 400 });
  }
  const settings = await updateSettings(parsed.data);
  return Response.json({ settings });
}
