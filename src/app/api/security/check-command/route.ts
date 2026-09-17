import { analyzeCommandLine, detectDangerousCommand, requiresConfirmation } from "@/lib/security-shared";
import { getSettings, updateSettings } from "@/lib/orchestrator/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { command?: string };
  if (typeof body.command !== "string") return Response.json({ error: "MISSING_COMMAND" }, { status: 400 });

  const config = await getSettings();
  const verdict = analyzeCommandLine(body.command, config.permissionMode, config.alwaysAllowCommands);

  return Response.json({
    dangerous: detectDangerousCommand(body.command),
    requiresConfirmation: requiresConfirmation(body.command, config.permissionMode),
    verdict,
    permissionMode: config.permissionMode,
  });
}

/** "Luôn cho phép trong Workspace này" — plan §51. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { command?: string };
  if (!body.command?.trim()) return Response.json({ error: "MISSING_COMMAND" }, { status: 400 });

  const config = await getSettings();
  const next = Array.from(new Set([...config.alwaysAllowCommands, body.command.trim()]));
  const updated = await updateSettings({ alwaysAllowCommands: next });
  return Response.json({ settings: updated });
}
