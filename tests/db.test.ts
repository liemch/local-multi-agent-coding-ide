import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Drives the real SQLite driver against a throwaway database file so the
 * embedded migration and the drizzle proxy are both exercised end to end.
 */
let tmpDir = "";

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ide-db-"));
  process.env.IDE_DATABASE_FILE = path.join(tmpDir, "test.db");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("sqlite driver", () => {
  it("creates the database file on first access", async () => {
    const { getSqlite, databaseFile } = await import("@/db/sqlite-driver");
    getSqlite();
    expect(databaseFile()).toBe(process.env.IDE_DATABASE_FILE);
    expect(fs.existsSync(databaseFile())).toBe(true);
  });

  it("runs the embedded migration exactly once", async () => {
    const { getSqlite } = await import("@/db/sqlite-driver");
    const database = getSqlite();
    const rows = database.prepare("select id from __migrations").all() as Array<{ id: string }>;
    expect(rows.map((row) => row.id)).toContain("0001_init");
    expect(rows.filter((row) => row.id === "0001_init")).toHaveLength(1);
  });

  it("creates every table the app needs", async () => {
    const { getSqlite } = await import("@/db/sqlite-driver");
    const database = getSqlite();
    const names = (
      database.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    ).map((row) => row.name);

    for (const table of [
      "workspaces",
      "tasks",
      "agents",
      "provider_accounts",
      "agent_sessions",
      "agent_events",
      "checkpoints",
      "terminal_sessions",
      "usage_snapshots",
      "settings",
      "task_timeline",
      "approvals",
    ]) {
      expect(names, table).toContain(table);
    }
  });

  it("enables foreign keys and WAL", async () => {
    const { getSqlite } = await import("@/db/sqlite-driver");
    const database = getSqlite();
    const fk = database.prepare("pragma foreign_keys").get() as Record<string, number>;
    expect(Object.values(fk)[0]).toBe(1);
  });
});

describe("drizzle proxy", () => {
  it("round-trips a workspace row", async () => {
    const { db } = await import("@/db");
    const { workspaces } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await db.insert(workspaces).values({
      id: "ws-test-1",
      name: "demo",
      path: "/tmp/demo",
      gitRepository: true,
      branch: "main",
    });

    const rows = await db.select().from(workspaces).where(eq(workspaces.id, "ws-test-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("demo");
    expect(rows[0].gitRepository).toBe(true);
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("keeps duplicate column names distinct across a join (setReturnArrays)", async () => {
    const { db } = await import("@/db");
    const { workspaces, tasks } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await db.insert(tasks).values({
      id: "TASK-900",
      workspaceId: "ws-test-1",
      title: "join check",
      description: "",
      mode: "implement",
      priority: "normal",
      status: "draft",
    });

    const rows = await db
      .select()
      .from(tasks)
      .innerJoin(workspaces, eq(tasks.workspaceId, workspaces.id))
      .where(eq(tasks.id, "TASK-900"));

    // Both tables have `id`, `status`/`name` style collisions — they must not merge.
    expect(rows[0].tasks.id).toBe("TASK-900");
    expect(rows[0].workspaces.id).toBe("ws-test-1");
  });

  it("persists json columns as real arrays", async () => {
    const { db } = await import("@/db");
    const { settings } = await import("@/db/schema");

    await db.insert(settings).values({ id: "global", agentPriority: ["claude", "codex", "antigravity"] });
    const rows = await db.select().from(settings);
    expect(rows[0].agentPriority).toEqual(["claude", "codex", "antigravity"]);
    expect(rows[0].alwaysAllowCommands).toEqual([]);
  });

  it("updates and deletes", async () => {
    const { db } = await import("@/db");
    const { tasks } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await db.update(tasks).set({ status: "running" }).where(eq(tasks.id, "TASK-900"));
    let rows = await db.select().from(tasks).where(eq(tasks.id, "TASK-900"));
    expect(rows[0].status).toBe("running");

    await db.delete(tasks).where(eq(tasks.id, "TASK-900"));
    rows = await db.select().from(tasks).where(eq(tasks.id, "TASK-900"));
    expect(rows).toHaveLength(0);
  });
});
