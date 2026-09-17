import { pauseTask } from "@/lib/orchestrator/engine";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pauseTask(id);
  return Response.json({ ok: true });
}
