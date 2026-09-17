import path from "node:path";
import os from "node:os";

export * from "./security-shared";

/** Paths an agent must never touch by default — plan §49. */
export function protectedPaths(): string[] {
  const home = os.homedir();
  return [
    path.parse(process.cwd()).root,
    "/",
    "/etc",
    "/root",
    "/boot",
    "/sys",
    "/proc",
    "/var",
    "/usr",
    "/bin",
    "/sbin",
    home,
    path.join(home, ".ssh"),
    path.join(home, ".aws"),
    path.join(home, ".config"),
    path.join(home, ".gnupg"),
    path.join(home, ".kube"),
    path.join(home, ".docker"),
  ];
}

export const PROTECTED_PATHS = protectedPaths();

/**
 * True when `target` is a protected location, or sits inside one of the
 * sensitive credential directories.
 */
export function isProtectedPath(target: string): boolean {
  const normalized = path.resolve(target);
  const home = os.homedir();

  const exact = protectedPaths().map((p) => path.resolve(p));
  if (exact.includes(normalized)) return true;

  // Anything *inside* these is protected too — `/usr` alone is not enough,
  // `/usr/bin/anything` must be blocked as well.
  const sensitiveRoots = [
    path.join(home, ".ssh"),
    path.join(home, ".aws"),
    path.join(home, ".gnupg"),
    path.join(home, ".kube"),
    path.join(home, ".docker"),
    "/etc",
    "/proc",
    "/sys",
    "/boot",
    "/root",
    "/usr",
    "/bin",
    "/sbin",
    "/var",
  ].map((p) => path.resolve(p));

  return sensitiveRoots.some((root) => {
    const relative = path.relative(root, normalized);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

/** Ensures `target` stays inside `root` — blocks path traversal (rule #13). */
export function assertInsideWorkspace(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("PATH_OUTSIDE_WORKSPACE");
  }
  return resolvedTarget;
}

export function isInsideWorkspace(root: string, target: string): boolean {
  try {
    assertInsideWorkspace(root, target);
    return true;
  } catch {
    return false;
  }
}
