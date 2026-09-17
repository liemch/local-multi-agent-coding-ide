import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const dynamic = "force-dynamic";

async function ensureSettings() {
  const rows = await db.select().from(settings).where(eq(settings.id, "global"));
  if (rows.length) return rows[0];
  const [row] = await db.insert(settings).values({ id: "global" }).returning();
  return row;
}

export async function GET() {
  const row = await ensureSettings();
  return Response.json({ settings: row });
}

export async function PUT(req: Request) {
  await ensureSettings();
  const body = await req.json().catch(() => ({}));
  const allowed = [
    "routingMode",
    "agentPriority",
    "warningThreshold",
    "autoHandoff",
    "simulateWhenMissing",
    "permissionMode",
    "autoCreateBranch",
    "locale",
  ] as const;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  const [row] = await db.update(settings).set(update).where(eq(settings.id, "global")).returning();
  return Response.json({ settings: row });
}
