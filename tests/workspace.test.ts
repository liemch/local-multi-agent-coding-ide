import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureSampleProject, readFileTree, resolveWorkspaceFile, validateWorkspacePath } from "@/lib/workspace";
import { assertInsideWorkspace, isInsideWorkspace, isProtectedPath } from "@/lib/security";

let root = "";

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ide-ws-"));
  await fs.mkdir(path.join(root, "src", "lib"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "junk"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"), { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), "{}\n");
  await fs.writeFile(path.join(root, "src", "index.ts"), "export {};\n");
  await fs.writeFile(path.join(root, "src", "lib", "util.ts"), "export {};\n");
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("protected paths (plan §49)", () => {
  it("blocks system directories", () => {
    for (const target of ["/", "/etc", "/etc/passwd", "/root", "/usr/bin", "/proc/1"]) {
      expect(isProtectedPath(target), target).toBe(true);
    }
  });

  it("blocks credential directories in $HOME", () => {
    const home = os.homedir();
    expect(isProtectedPath(home)).toBe(true);
    expect(isProtectedPath(path.join(home, ".ssh"))).toBe(true);
    expect(isProtectedPath(path.join(home, ".ssh", "id_rsa"))).toBe(true);
    expect(isProtectedPath(path.join(home, ".aws", "credentials"))).toBe(true);
  });

  it("allows an ordinary project directory", () => {
    expect(isProtectedPath(root)).toBe(false);
  });
});

describe("validateWorkspacePath", () => {
  it("accepts a real project directory", async () => {
    expect(await validateWorkspacePath(root)).toEqual({ ok: true });
  });

  it("rejects a protected path", async () => {
    expect(await validateWorkspacePath("/etc")).toEqual({ ok: false, error: "PROTECTED_PATH" });
  });

  it("rejects a non-existent path", async () => {
    const result = await validateWorkspacePath(path.join(root, "nope"));
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects a file", async () => {
    const result = await validateWorkspacePath(path.join(root, "package.json"));
    expect(result).toEqual({ ok: false, error: "NOT_A_DIRECTORY" });
  });
});

describe("path traversal (rule #13)", () => {
  it("resolves a legitimate relative path", () => {
    expect(resolveWorkspaceFile(root, "src/index.ts")).toBe(path.join(root, "src", "index.ts"));
  });

  it("refuses to escape the workspace", () => {
    expect(() => resolveWorkspaceFile(root, "../../../etc/passwd")).toThrow("PATH_OUTSIDE_WORKSPACE");
    expect(() => assertInsideWorkspace(root, "/etc/passwd")).toThrow("PATH_OUTSIDE_WORKSPACE");
    expect(isInsideWorkspace(root, path.join(root, "..", "other"))).toBe(false);
    expect(isInsideWorkspace(root, path.join(root, "src"))).toBe(true);
  });
});

describe("readFileTree", () => {
  it("lists directories first and skips noise folders", async () => {
    const tree = await readFileTree(root);
    const names = tree.map((node) => node.name);
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain(".git");
    expect(names).toContain("src");
    expect(names).toContain("package.json");
    expect(tree[0].type).toBe("directory");
  });

  it("returns posix-style relative paths and nests children", async () => {
    const tree = await readFileTree(root);
    const src = tree.find((node) => node.name === "src")!;
    expect(src.children?.map((child) => child.path)).toContain("src/index.ts");
    const lib = src.children?.find((child) => child.name === "lib");
    expect(lib?.children?.[0].path).toBe("src/lib/util.ts");
  });

  it("returns an empty array for a missing directory instead of throwing", async () => {
    expect(await readFileTree(path.join(root, "missing"))).toEqual([]);
  });
});

describe("sample project", () => {
  it("creates a runnable demo workspace on demand", async () => {
    const sample = await ensureSampleProject();
    const stat = await fs.stat(sample);
    expect(stat.isDirectory()).toBe(true);
    expect(await validateWorkspacePath(sample)).toEqual({ ok: true });
  });
});
