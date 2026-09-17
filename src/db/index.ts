import { drizzle } from "drizzle-orm/sqlite-proxy";
import { executeSql, type SqlMethod } from "./sqlite-driver";
import * as schema from "./schema";

/**
 * Local-first database (plan §7, §45): SQLite on disk, no server to run.
 * `drizzle-orm/sqlite-proxy` lets us drive Node's built-in `node:sqlite`
 * synchronously behind drizzle's async API.
 */
export const db = drizzle(
  async (sqlText: string, params: unknown[], method: SqlMethod) => {
    try {
      return executeSql(sqlText, params, method);
    } catch (error) {
      console.error("[sqlite] query failed", { sqlText, error });
      throw error;
    }
  },
  { schema },
);

export { schema };
export { databaseFile, getSqlite } from "./sqlite-driver";
