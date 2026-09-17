import { detectDangerousCommand, requiresConfirmation, type PermissionMode } from "@/lib/security-shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { command, permissionMode } = body as { command: string; permissionMode?: PermissionMode };
  if (typeof command !== "string") return Response.json({ error: "MISSING_COMMAND" }, { status: 400 });
  const dangerous = detectDangerousCommand(command);
  const needsConfirm = requiresConfirmation(command, permissionMode ?? "balanced");
  return Response.json({ dangerous, requiresConfirmation: needsConfirm });
}
