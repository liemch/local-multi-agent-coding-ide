import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { isProtectedPath } from "./security";

export const SAMPLE_PROJECT_ROOT = path.join(os.tmpdir(), "ide-workspaces", "demo-project");

export async function ensureSampleProject(): Promise<string> {
  await fs.mkdir(SAMPLE_PROJECT_ROOT, { recursive: true });
  const pkgPath = path.join(SAMPLE_PROJECT_ROOT, "package.json");
  try {
    await fs.access(pkgPath);
  } catch {
    await fs.writeFile(
      pkgPath,
      JSON.stringify(
        {
          name: "demo-project",
          version: "1.0.0",
          private: true,
          scripts: {
            test: "node test/health.test.js",
            dev: "node src/server.js",
          },
        },
        null,
        2,
      ),
    );
    await fs.mkdir(path.join(SAMPLE_PROJECT_ROOT, "src"), { recursive: true });
    await fs.mkdir(path.join(SAMPLE_PROJECT_ROOT, "test"), { recursive: true });
    await fs.writeFile(
      path.join(SAMPLE_PROJECT_ROOT, "src", "server.js"),
      `const http = require("http");\n\nconst server = http.createServer((req, res) => {\n  if (req.url === "/health") {\n    res.writeHead(200, { "Content-Type": "application/json" });\n    res.end(JSON.stringify({ status: "ok" }));\n    return;\n  }\n  res.writeHead(404);\n  res.end();\n});\n\nif (require.main === module) {\n  server.listen(3001, () => console.log("demo server listening on 3001"));\n}\n\nmodule.exports = server;\n`,
    );
    await fs.writeFile(
      path.join(SAMPLE_PROJECT_ROOT, "test", "health.test.js"),
      `// TODO: viết test cho GET /health\nconsole.log("no tests yet");\n`,
    );
    await fs.writeFile(
      path.join(SAMPLE_PROJECT_ROOT, "README.md"),
      `# Demo Project\n\nDự án mẫu dùng để thử nghiệm Local Multi-Agent Dev IDE.\n\nTODO: Tạo GET /health API và viết test.\n`,
    );
    await fs.writeFile(path.join(SAMPLE_PROJECT_ROOT, ".gitignore"), "node_modules\n.agent-manager/tmp\n");
    await fs.writeFile(
      path.join(SAMPLE_PROJECT_ROOT, ".env.example"),
      "API_KEY=changeme\nDATABASE_URL=postgres://localhost/demo\n",
    );
  }
  return SAMPLE_PROJECT_ROOT;
}

export async function validateWorkspacePath(target: string): Promise<{ ok: boolean; error?: string }> {
  const resolved = path.resolve(target);
  if (isProtectedPath(resolved)) {
    return { ok: false, error: "PROTECTED_PATH" };
  }
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, error: "NOT_A_DIRECTORY" };
    }
  } catch {
    return { ok: false, error: "NOT_FOUND" };
  }
  return { ok: true };
}

const IGNORED_DIR_NAMES = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo"]);

export interface FileTreeNode {
  name: string;
  path: string; // relative to workspace root, posix separators
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export async function readFileTree(root: string, relativeDir = "", depth = 4): Promise<FileTreeNode[]> {
  const abs = path.join(root, relativeDir);
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nodes: FileTreeNode[] = [];
  for (const entry of entries) {
    if (IGNORED_DIR_NAMES.has(entry.name)) continue;
    const relPath = path.posix.join(relativeDir.split(path.sep).join("/"), entry.name);
    if (entry.isDirectory()) {
      const node: FileTreeNode = { name: entry.name, path: relPath, type: "directory" };
      if (depth > 0) {
        node.children = await readFileTree(root, path.join(relativeDir, entry.name), depth - 1);
      }
      nodes.push(node);
    } else {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
    }
  }
  return nodes;
}

export function resolveWorkspaceFile(root: string, relativePath: string): string {
  const target = path.join(root, relativePath);
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("PATH_OUTSIDE_WORKSPACE");
  }
  return resolvedTarget;
}
