import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentEvents } from "@/db/schema";
import { subscribeTask, type BusEvent } from "@/lib/orchestrator/bus";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const history = await db
    .select()
    .from(agentEvents)
    .where(eq(agentEvents.taskId, id))
    .orderBy(desc(agentEvents.createdAt))
    .limit(100);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: BusEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: agent\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream closed
        }
      };

      for (const row of history.reverse()) {
        send({
          taskId: row.taskId,
          type: row.type,
          message: row.message,
          agent: row.agent,
          meta: (row.meta as Record<string, unknown>) ?? undefined,
          createdAt: row.createdAt.toISOString(),
        });
      }

      const unsubscribe = subscribeTask(id, send);

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
