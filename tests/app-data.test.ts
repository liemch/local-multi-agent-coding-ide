import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultAppDataDirectory, ensureAppDataDirectories, resolveAppDataPaths } from "@/lib/app-data";

const created: string[] = [];
afterEach(() => created.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe("app data paths", () => {
  it("uses platform conventions", () => {
    expect(defaultAppDataDirectory({ platform: "win32", env: { LOCALAPPDATA: "C:\\Data" }, homedir: "C:\\Users\\me" })).toBe(path.join("C:\\Data", "local-agent-ide"));
    expect(defaultAppDataDirectory({ platform: "darwin", env: {}, homedir: "/Users/me" })).toBe("/Users/me/Library/Application Support/local-agent-ide");
    expect(defaultAppDataDirectory({ platform: "linux", env: { XDG_DATA_HOME: "/xdg" }, homedir: "/home/me" })).toBe("/xdg/local-agent-ide");
  });

  it("creates data, logs and cache outside the package", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ide data ü-"));
    created.push(root);
    const paths = ensureAppDataDirectories(resolveAppDataPaths(root));
    expect(paths.database).toBe(path.join(root, "data", "ide.db"));
    expect([paths.data, paths.logs, paths.cache].every(fs.existsSync)).toBe(true);
  });

  it("rejects empty and null-byte overrides", () => {
    expect(() => resolveAppDataPaths(" ")).toThrow(/empty/);
    expect(() => resolveAppDataPaths("bad\0path")).toThrow(/null byte/);
  });
});
