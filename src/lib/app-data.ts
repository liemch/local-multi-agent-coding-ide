import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AppDataDependencies {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  homedir?: string;
  mkdir?: typeof fs.mkdirSync;
}

export interface AppDataPaths {
  root: string;
  data: string;
  logs: string;
  cache: string;
  database: string;
  config: string;
}

function nonEmptyPath(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
  if (value.includes("\0")) throw new Error(`${label} contains a null byte`);
  return path.resolve(value);
}

export function defaultAppDataDirectory(deps: AppDataDependencies = {}): string {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const home = deps.homedir ?? os.homedir();

  if (platform === "win32") {
    return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "local-agent-ide");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "local-agent-ide");
  }
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "local-agent-ide");
}

export function resolveAppDataPaths(override?: string, deps: AppDataDependencies = {}): AppDataPaths {
  const env = deps.env ?? process.env;
  const root = nonEmptyPath(
    override ?? env.LOCAL_AGENT_IDE_DATA_DIR ?? defaultAppDataDirectory(deps),
    "Data directory",
  );
  const data = path.join(root, "data");
  return {
    root,
    data,
    logs: path.join(root, "logs"),
    cache: path.join(root, "cache"),
    database: path.join(data, "ide.db"),
    config: path.join(root, "config.json"),
  };
}

export function ensureAppDataDirectories(paths = resolveAppDataPaths(), deps: AppDataDependencies = {}): AppDataPaths {
  const mkdir = deps.mkdir ?? fs.mkdirSync;
  for (const directory of [paths.root, paths.data, paths.logs, paths.cache]) {
    mkdir(directory, { recursive: true });
  }
  return paths;
}
