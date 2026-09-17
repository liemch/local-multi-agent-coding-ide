import { manualCheckpoint } from "@/lib/orchestrator/engine";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const cp = await manualCheckpoint(id);
    return Response.json({ checkpoint: cp });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
