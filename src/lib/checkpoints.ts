import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { checkpoints } from "@/db/schema";
import { taskDir, readFileSafe } from "./context";
import { getHead } from "./git";

/** Checkpoint engine (plan §32, Phase 7: create + restore). */

export interface CheckpointMetadata {
  taskId: string;
  name: string;
  reason: string;
  createdAt: string;
  gitHead: string | null;
  agent?: string | null;
}

export async function createCheckpoint(
  root: string,
  taskId: string,
  opts: { reason: string; agentSessionId?: string | null; agent?: string | null; terminalTail?: string },
) {
  const dir = taskDir(root, taskId);
  const checkpointsDir = path.join(dir, "checkpoints");
  await fs.mkdir(checkpointsDir, { recursive: true });

  const existing = await fs.readdir(checkpointsDir).catch(() => [] as string[]);
  const nextIndex = existing.filter((f) => f.startsWith("checkpoint-")).length + 1;
  const name = `checkpoint-${String(nextIndex).padStart(4, "0")}`;
  const cpDir = path.join(checkpointsDir, name);
  await fs.mkdir(cpDir, { recursive: true });

  const [progress, todo, decisions, contextMd, filesTouched, gitStateRaw] = await Promise.all([
    readFileSafe(path.join(dir, "progress.md")),
    readFileSafe(path.join(dir, "todo.md")),
    readFileSafe(path.join(dir, "decisions.md")),
    readFileSafe(path.join(dir, "context.md")),
    readFileSafe(path.join(dir, "files-touched.json")),
    readFileSafe(path.join(dir, "git-state.json")),
  ]);
  const head = await getHead(root);

  const metadata: CheckpointMetadata = {
    taskId,
    name,
    reason: opts.reason,
    createdAt: new Date().toISOString(),
    gitHead: head,
    agent: opts.agent ?? null,
  };

  await Promise.all([
    fs.writeFile(path.join(cpDir, "progress.md"), progress),
    fs.writeFile(path.join(cpDir, "todo.md"), todo),
    fs.writeFile(path.join(cpDir, "decisions.md"), decisions),
    fs.writeFile(path.join(cpDir, "context.md"), contextMd),
    fs.writeFile(path.join(cpDir, "files-touched.json"), filesTouched || "[]"),
    fs.writeFile(path.join(cpDir, "git-state.json"), gitStateRaw || "{}"),
    fs.writeFile(path.join(cpDir, "terminal.log"), opts.terminalTail ?? ""),
    fs.writeFile(path.join(cpDir, "metadata.json"), JSON.stringify(metadata, null, 2)),
  ]);

  const id = randomUUID();
  await db.insert(checkpoints).values({
    id,
    taskId,
    agentSessionId: opts.agentSessionId ?? null,
    name,
    path: cpDir,
    gitHead: head,
    reason: opts.reason,
  });

  return { id, name, path: cpDir, gitHead: head };
}

export async function listCheckpoints(taskId: string) {
  return db.select().from(checkpoints).where(eq(checkpoints.taskId, taskId)).orderBy(desc(checkpoints.createdAt));
}

export async function readCheckpoint(checkpointId: string) {
  const rows = await db.select().from(checkpoints).where(eq(checkpoints.id, checkpointId));
  const row = rows[0];
  if (!row) return null;

  const [metadataRaw, progress, todo, decisions, contextMd, filesTouched, gitState, terminal] = await Promise.all([
    readFileSafe(path.join(row.path, "metadata.json")),
    readFileSafe(path.join(row.path, "progress.md")),
    readFileSafe(path.join(row.path, "todo.md")),
    readFileSafe(path.join(row.path, "decisions.md")),
    readFileSafe(path.join(row.path, "context.md")),
    readFileSafe(path.join(row.path, "files-touched.json")),
    readFileSafe(path.join(row.path, "git-state.json")),
    readFileSafe(path.join(row.path, "terminal.log")),
  ]);

  return {
    checkpoint: row,
    metadata: metadataRaw ? (JSON.parse(metadataRaw) as CheckpointMetadata) : null,
    progress,
    todo,
    decisions,
    context: contextMd,
    filesTouched,
    gitState,
    terminal,
  };
}

/**
 * Restores the task's context files from a checkpoint.
 * Source code is intentionally NOT reverted — git is the source of truth for
 * code, and silently discarding a user's edits would violate plan §60.
 */
export async function restoreCheckpoint(
  root: string,
  checkpointId: string,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const data = await readCheckpoint(checkpointId);
  if (!data) return { ok: false, error: "CHECKPOINT_NOT_FOUND" };

  const dir = taskDir(root, data.checkpoint.taskId);
  await fs.mkdir(dir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(dir, "progress.md"), data.progress),
    fs.writeFile(path.join(dir, "todo.md"), data.todo),
    fs.writeFile(path.join(dir, "decisions.md"), data.decisions),
    fs.writeFile(path.join(dir, "context.md"), data.context),
    fs.writeFile(path.join(dir, "files-touched.json"), data.filesTouched || "[]"),
  ]);

  return { ok: true, name: data.checkpoint.name };
}
