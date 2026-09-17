import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Real SQLite, backed by Node's built-in `node:sqlite` (Node >= 22.5).
 * Chosen over better-sqlite3 so the IDE installs with zero native toolchain —
 * see docs/architecture.md (ADR-001).
 */

export type SqlMethod = "run" | "all" | "values" | "get";

const globalStore = globalThis as typeof globalThis & {
  __ideSqlite?: DatabaseSync;
};

export function databaseFile(): string {
  if (process.env.IDE_DATABASE_FILE) return path.resolve(process.env.IDE_DATABASE_FILE);
  return path.resolve(process.cwd(), "data", "ide.db");
}

export function getSqlite(): DatabaseSync {
  if (globalStore.__ideSqlite) return globalStore.__ideSqlite;

  const file = databaseFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");

  migrate(database);
  globalStore.__ideSqlite = database;
  return database;
}

/** Normalises JS values into something node:sqlite accepts as a bound parameter. */
function toBindable(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return value;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/**
 * Callback for drizzle's sqlite-proxy driver.
 * drizzle maps results positionally, so rows must be arrays (setReturnArrays).
 */
export function executeSql(sqlText: string, params: unknown[], method: SqlMethod): { rows: unknown[] } {
  const database = getSqlite();
  const statement = database.prepare(sqlText);
  const bound = params.map(toBindable);

  if (method === "run") {
    statement.run(...(bound as never[]));
    return { rows: [] };
  }

  statement.setReturnArrays(true);
  const rows = statement.all(...(bound as never[])) as unknown[];

  if (method === "get") {
    return { rows: (rows[0] as unknown[]) ?? [] };
  }
  return { rows };
}

const MIGRATIONS: Array<{ id: string; sql: string }> = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        git_repository INTEGER NOT NULL DEFAULT 0,
        branch TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        last_opened_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS workspaces_path_idx ON workspaces(path);

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT 'implement',
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'draft',
        preferred_agent TEXT,
        active_agent TEXT,
        active_provider_account_id TEXT,
        branch TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        started_at INTEGER,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS tasks_workspace_idx ON tasks(workspace_id);

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        binary_path TEXT,
        version TEXT,
        installed INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_checked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS provider_accounts (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unknown',
        percentage_used INTEGER,
        remaining INTEGER,
        reset_at INTEGER,
        source TEXT NOT NULL DEFAULT 'unknown',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS provider_accounts_agent_idx ON provider_accounts(agent);

      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        provider_account_id TEXT,
        provider_session_id TEXT,
        terminal_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        ended_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS agent_sessions_task_idx ON agent_sessions(task_id);

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_session_id TEXT,
        name TEXT NOT NULL DEFAULT '',
        path TEXT NOT NULL,
        git_head TEXT,
        reason TEXT NOT NULL DEFAULT 'manual',
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS checkpoints_task_idx ON checkpoints(task_id);

      CREATE TABLE IF NOT EXISTS agent_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent TEXT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        meta TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS agent_events_task_idx ON agent_events(task_id);

      CREATE TABLE IF NOT EXISTS terminal_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        agent TEXT,
        task_id TEXT,
        cwd TEXT NOT NULL,
        pid INTEGER,
        status TEXT NOT NULL DEFAULT 'running',
        title TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE TABLE IF NOT EXISTS usage_snapshots (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL,
        provider_account_id TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        percentage_used INTEGER,
        remaining INTEGER,
        reset_at INTEGER,
        source TEXT NOT NULL DEFAULT 'unknown',
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY DEFAULT 'global',
        locale TEXT NOT NULL DEFAULT 'vi',
        routing_mode TEXT NOT NULL DEFAULT 'smart',
        agent_priority TEXT NOT NULL DEFAULT '["codex","claude","antigravity"]',
        warning_threshold INTEGER NOT NULL DEFAULT 85,
        auto_handoff INTEGER NOT NULL DEFAULT 1,
        preemptive_handoff INTEGER NOT NULL DEFAULT 1,
        simulate_when_missing INTEGER NOT NULL DEFAULT 1,
        permission_mode TEXT NOT NULL DEFAULT 'balanced',
        auto_create_branch INTEGER NOT NULL DEFAULT 0,
        always_allow_commands TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE TABLE IF NOT EXISTS task_timeline (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        label TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS task_timeline_task_idx ON task_timeline(task_id);

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        task_id TEXT,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        resolved_at INTEGER
      );
    `,
  },
];

function migrate(database: DatabaseSync) {
  database.exec(`CREATE TABLE IF NOT EXISTS __migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  const applied = new Set(
    (database.prepare("SELECT id FROM __migrations").all() as Array<{ id: string }>).map((r) => r.id),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    database.exec("BEGIN");
    try {
      database.exec(migration.sql);
      database.prepare("INSERT INTO __migrations (id) VALUES (?)").run(migration.id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

/** Test helper: opens an isolated in-memory database. */
export function createInMemoryDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  return database;
}
