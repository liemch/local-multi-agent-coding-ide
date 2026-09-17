import path from "node:path";
import os from "node:os";

export * from "./security-shared";

// Paths that must never be treated as a workspace root or accessed by an agent.
export const PROTECTED_PATHS = [
  "/",
  "/etc",
  "/root",
  "/boot",
  "/sys",
  "/proc",
  path.join(os.homedir(), ".ssh"),
  path.join(os.homedir(), ".aws"),
  path.join(os.homedir(), ".config"),
  path.join(os.homedir(), ".gnupg"),
];

export function isProtectedPath(target: string): boolean {
  const normalized = path.resolve(target);
  return PROTECTED_PATHS.some((protectedPath) => {
    const p = path.resolve(protectedPath);
    return normalized === p;
  });
}

/** Ensures `target` is inside `root`, preventing path traversal outside the workspace. */
export function assertInsideWorkspace(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("PATH_OUTSIDE_WORKSPACE");
  }
  return resolvedTarget;
}
