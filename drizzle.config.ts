import type { Config } from "drizzle-kit";

export default {
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.IDE_DATABASE_FILE ?? "./data/ide.db",
  },
} satisfies Config;
