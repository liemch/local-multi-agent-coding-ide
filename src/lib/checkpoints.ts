import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { checkpoints } from "@/db/schema";
import { taskDir, readFile } from "./context";
import { getHead } from "./git";

export async function createCheckpoint(
  root: string,
  taskId: string,
  opts: { reason: string; agentSessionId?: string | null; terminalTail?: string },
) {
  const dir = taskDir(root, taskId);
  const checkpointsDir = path.join(dir, "checkpoints");
  await fs.mkdir(checkpointsDir, { recursive: true });
  const existing = await fs.readdir(checkpointsDir).catch(() => []);
  const nextIndex = existing.filter((f) => f.startsWith("checkpoint-")).length + 1;
  const name = `checkpoint-${String(nextIndex).padStart(4, "0")}`;
  const cpDir = path.join(checkpointsDir, name);
  await fs.mkdir(cpDir, { recursive: true });

  const [progress, todo, decisions] = await Promise.all([
    readFile(path.join(dir, "progress.md")),
    readFile(path.join(dir, "todo.md")),
    readFile(path.join(dir, "decisions.md")),
  ]);
  const head = await getHead(root);
  const gitStateRaw = await readFile(path.join(dir, "git-state.json"));

  await Promise.all([
    fs.writeFile(path.join(cpDir, "progress.md"), progress),
    fs.writeFile(path.join(cpDir, "todo.md"), todo),
    fs.writeFile(path.join(cpDir, "decisions.md"), decisions),
    fs.writeFile(path.join(cpDir, "git-state.json"), gitStateRaw || "{}"),
    fs.writeFile(path.join(cpDir, "terminal.log"), opts.terminalTail ?? ""),
    fs.writeFile(
      path.join(cpDir, "metadata.json"),
      JSON.stringify({ taskId, reason: opts.reason, createdAt: new Date().toISOString(), gitHead: head }, null, 2),
    ),
  ]);

  const id = randomUUID();
  await db.insert(checkpoints).values({
    id,
    taskId,
    agentSessionId: opts.agentSessionId ?? null,
    path: cpDir,
    gitHead: head,
    reason: opts.reason,
  });

  return { id, name, path: cpDir, gitHead: head };
}
