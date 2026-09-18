import { getSessionMeta, writeToSession } from "@/lib/terminal";
import { analyzeCommandLine } from "@/lib/security-shared";
import { getSettings } from "@/lib/orchestrator/settings";

export const dynamic = "force-dynamic";

/**
 * Terminal input with real enforcement (plan §51/§52, rule fix).
 * A submitted line (ending in CR) is checked against the permission mode before
 * it ever reaches the PTY. Plain keystrokes pass straight through so typing
 * stays responsive.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { data?: string; approved?: boolean };
  const { data, approved } = body;

  if (typeof data !== "string") return Response.json({ error: "MISSING_DATA" }, { status: 400 });

  const session = getSessionMeta(id);
  if (!session) return Response.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

  // Only inspect when the user actually submits a command line.
  const submitsLine = data.includes("\r") || data.includes("\n");
  if (submitsLine && !approved) {
    const line = data.replace(/[\r\n]+$/, "").trim();
    if (line) {
      const config = await getSettings();
      const verdict = analyzeCommandLine(line, config.permissionMode, config.alwaysAllowCommands);
      if (verdict && (verdict.dangerous || verdict.requiresConfirmation)) {
        return Response.json({
          blocked: true,
          requiresConfirmation: true,
          command: verdict.command,
          dangerous: verdict.dangerous,
          permissionMode: config.permissionMode,
        });
      }
    }
  }

  writeToSession(id, data);
  return Response.json({ ok: true });
}
