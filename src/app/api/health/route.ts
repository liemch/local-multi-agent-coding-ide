import { getSqlite, databaseFile } from "@/db";
import { ptyBackend } from "@/lib/terminal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getSqlite();
    const row = database.prepare("select 1 as ok").get() as { ok: number };
    return Response.json({
      ok: row.ok === 1,
      version: process.env.LOCAL_AGENT_IDE_VERSION ?? "development",
      database: { ok: row.ok === 1, ...(process.env.LOCAL_AGENT_IDE_DEBUG === "1" ? { path: databaseFile() } : {}) },
      ptyBackend: ptyBackend(),
      platform: process.platform,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
