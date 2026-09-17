import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpDbDir = "";
let root = "";
const TASK_ID = "TASK-050";

beforeAll(async () => {
  tmpDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "ide-cp-db-"));
  process.env.IDE_DATABASE_FILE = path.join(tmpDbDir, "cp.db");

  root = await fsp.mkdtemp(path.join(os.tmpdir(), "ide-cp-ws-"));

  const { initTaskContext, appendProgress, setTodo, recordFilesTouched } = await import("@/lib/context");
  await initTaskContext(root, { id: TASK_ID, title: "Checkpoint test", description: "", mode: "implement" });
  await appendProgress(root, TASK_ID, "Bước 1 xong");
  await setTodo(root, TASK_ID, ["Bước 2", "Bước 3"]);
  await recordFilesTouched(root, TASK_ID, ["src/a.ts"]);
});

afterAll(async () => {
  fs.rmSync(tmpDbDir, { recursive: true, force: true });
  await fsp.rm(root, { recursive: true, force: true });
});

describe("checkpoint engine (plan §32)", () => {
  it("writes a checkpoint folder with all context snapshots", async () => {
    const { createCheckpoint } = await import("@/lib/checkpoints");
    const checkpoint = await createCheckpoint(root, TASK_ID, { reason: "manual", agent: "codex" });

    expect(checkpoint.name).toBe("checkpoint-0001");
    for (const file of ["progress.md", "todo.md", "decisions.md", "context.md", "metadata.json"]) {
      expect(fs.existsSync(path.join(checkpoint.path, file)), file).toBe(true);
    }
    const metadata = JSON.parse(await fsp.readFile(path.join(checkpoint.path, "metadata.json"), "utf8"));
    expect(metadata.taskId).toBe(TASK_ID);
    expect(metadata.reason).toBe("manual");
    expect(metadata.agent).toBe("codex");
  });

  it("numbers checkpoints sequentially", async () => {
    const { createCheckpoint } = await import("@/lib/checkpoints");
    const second = await createCheckpoint(root, TASK_ID, { reason: "before_handoff" });
    expect(second.name).toBe("checkpoint-0002");
  });

  it("lists checkpoints newest-first", async () => {
    const { listCheckpoints } = await import("@/lib/checkpoints");
    const rows = await listCheckpoints(TASK_ID);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.map((row) => row.name)).toContain("checkpoint-0001");
  });

  it("reads a checkpoint back with its content", async () => {
    const { listCheckpoints, readCheckpoint } = await import("@/lib/checkpoints");
    const rows = await listCheckpoints(TASK_ID);
    const first = rows.find((row) => row.name === "checkpoint-0001")!;
    const data = await readCheckpoint(first.id);
    expect(data?.progress).toContain("Bước 1 xong");
    expect(data?.todo).toContain("Bước 2");
  });

  it("restores context files and never touches source code (plan §60)", async () => {
    const { listCheckpoints, restoreCheckpoint } = await import("@/lib/checkpoints");
    const { appendProgress, taskDir } = await import("@/lib/context");

    // A source file that must survive the restore untouched.
    const sourceFile = path.join(root, "src-file.ts");
    await fsp.mkdir(path.dirname(sourceFile), { recursive: true });
    await fsp.writeFile(sourceFile, "export const keepMe = 1;\n");

    await appendProgress(root, TASK_ID, "Bước 2 xong (sẽ bị hoàn tác)");
    const progressPath = path.join(taskDir(root, TASK_ID), "progress.md");
    expect(await fsp.readFile(progressPath, "utf8")).toContain("sẽ bị hoàn tác");

    const rows = await listCheckpoints(TASK_ID);
    const first = rows.find((row) => row.name === "checkpoint-0001")!;
    const result = await restoreCheckpoint(root, first.id);

    expect(result.ok).toBe(true);
    expect(result.name).toBe("checkpoint-0001");

    const restored = await fsp.readFile(progressPath, "utf8");
    expect(restored).toContain("Bước 1 xong");
    expect(restored).not.toContain("sẽ bị hoàn tác");

    // Source code is untouched — git remains the source of truth for code.
    expect(await fsp.readFile(sourceFile, "utf8")).toBe("export const keepMe = 1;\n");
  });

  it("reports an error for an unknown checkpoint instead of throwing", async () => {
    const { restoreCheckpoint, readCheckpoint } = await import("@/lib/checkpoints");
    expect(await readCheckpoint("nope")).toBeNull();
    const result = await restoreCheckpoint(root, "nope");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("CHECKPOINT_NOT_FOUND");
  });
});
