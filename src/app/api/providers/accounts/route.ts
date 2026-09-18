import { AGENT_IDS, type AgentId } from "@/lib/agents/types";
import { createAccount, deleteAccount, ensureDefaultAccounts, listAccounts, setAccountEnabled } from "@/lib/providers/accounts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agent = searchParams.get("agent") as AgentId | null;
  await ensureDefaultAccounts(AGENT_IDS);
  const accounts = await listAccounts(agent ?? undefined);
  return Response.json({ accounts });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    agent?: AgentId;
    name?: string;
    provider?: string;
    priority?: number;
  };
  if (!body.agent || !AGENT_IDS.includes(body.agent) || !body.name?.trim()) {
    return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }
  const account = await createAccount({
    agent: body.agent,
    name: body.name.trim(),
    provider: body.provider,
    priority: body.priority,
  });
  return Response.json({ account });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; enabled?: boolean };
  if (!body.id || typeof body.enabled !== "boolean") {
    return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }
  await setAccountEnabled(body.id, body.enabled);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "MISSING_ID" }, { status: 400 });
  await deleteAccount(id);
  return Response.json({ ok: true });
}
