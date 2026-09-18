// Pure, isomorphic security helpers (no Node-only imports) so they can run
// both on the server and inside client components.

export const SENSITIVE_FILE_PATTERNS = [
  /^\.env$/i,
  /^\.env\..*$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^credentials\.json$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /secrets?\.(ya?ml|json|toml)$/i,
];

export function isSensitiveFile(fileName: string): boolean {
  const base = fileName.split("/").pop() ?? fileName;
  if (/^\.env\.example$/i.test(base) || /^\.env\.sample$/i.test(base)) return false;
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(base));
}

export interface DangerousCommandMatch {
  pattern: string;
  description: string;
}

/** Commands that require explicit confirmation — plan §51. */
export const DANGEROUS_COMMAND_PATTERNS: DangerousCommandMatch[] = [
  { pattern: "rm\\s+(-[a-z]*\\s+)*-?[a-z]*r[a-z]*f", description: "Xóa đệ quy không thể khôi phục" },
  { pattern: "rm\\s+-rf", description: "Xóa đệ quy không thể khôi phục" },
  { pattern: "\\bsudo\\b", description: "Thực thi với quyền quản trị" },
  { pattern: "git\\s+reset\\s+--hard", description: "Xóa thay đổi chưa commit" },
  { pattern: "git\\s+clean\\s+-[a-z]*f", description: "Xóa file chưa theo dõi" },
  { pattern: "git\\s+push\\s+.*(--force|-f)\\b", description: "Ghi đè lịch sử remote" },
  { pattern: "drop\\s+database", description: "Xóa toàn bộ database" },
  { pattern: "drop\\s+table", description: "Xóa bảng dữ liệu" },
  { pattern: "truncate\\s+table", description: "Xóa sạch dữ liệu bảng" },
  { pattern: "docker\\s+system\\s+prune", description: "Xóa dữ liệu Docker" },
  { pattern: ":\\(\\)\\s*\\{\\s*:\\|:", description: "Fork bomb" },
  { pattern: "mkfs\\.", description: "Định dạng ổ đĩa" },
  { pattern: ">\\s*/dev/sd", description: "Ghi đè thiết bị lưu trữ" },
  { pattern: "dd\\s+if=.*of=/dev/", description: "Ghi trực tiếp lên thiết bị" },
  { pattern: "chmod\\s+-R\\s+777\\s+/", description: "Thay đổi quyền toàn hệ thống" },
  { pattern: "curl[^|]*\\|\\s*(ba)?sh", description: "Thực thi script tải từ Internet" },
  { pattern: "wget[^|]*\\|\\s*(ba)?sh", description: "Thực thi script tải từ Internet" },
  { pattern: "shutdown|reboot|halt\\b", description: "Tắt/khởi động lại máy" },
];

export function detectDangerousCommand(command: string): DangerousCommandMatch | null {
  for (const entry of DANGEROUS_COMMAND_PATTERNS) {
    if (new RegExp(entry.pattern, "i").test(command)) return entry;
  }
  return null;
}

export type PermissionMode = "safe" | "balanced" | "auto";

/**
 * Commands that mutate the project but are normal development work.
 * In "safe" mode these still need approval; in balanced/auto they don't.
 */
const WRITE_COMMAND_PATTERN =
  /\b(rm|mv|cp\s+-r|npm\s+(i|install|uninstall|ci)|yarn\s+(add|remove)|pnpm\s+(add|remove)|pip\s+install|git\s+(commit|checkout|merge|rebase|stash)|make|docker)\b/i;

/**
 * Decides whether a command needs human approval (plan §52).
 * - safe:     dangerous + any write/install command
 * - balanced: dangerous only
 * - auto:     dangerous system-level only (still never fully unguarded)
 */
export function requiresConfirmation(command: string, mode: PermissionMode): boolean {
  const dangerous = detectDangerousCommand(command);
  if (dangerous) return true;
  if (mode === "safe") return WRITE_COMMAND_PATTERN.test(command);
  return false;
}

/** Extracts individual commands from a shell line (split on ; && || |). */
export function splitCommandChain(line: string): string[] {
  return line
    .split(/;|&&|\|\||\|/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function analyzeCommandLine(
  line: string,
  mode: PermissionMode,
  alwaysAllow: string[] = [],
): { requiresConfirmation: boolean; dangerous: DangerousCommandMatch | null; command: string } | null {
  const allowSet = new Set(alwaysAllow.map((c) => c.trim()));
  for (const command of splitCommandChain(line)) {
    if (allowSet.has(command)) continue;
    const dangerous = detectDangerousCommand(command);
    const needsConfirm = requiresConfirmation(command, mode);
    if (dangerous || needsConfirm) {
      return { requiresConfirmation: needsConfirm, dangerous, command };
    }
  }
  return null;
}

/** Redacts secrets before anything is logged or shown — plan §53, rule #14. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(sk-[A-Za-z0-9_-]{12,})/g, "sk-***REDACTED***"],
  [/(ghp_[A-Za-z0-9]{20,})/g, "ghp_***REDACTED***"],
  [/(gho_[A-Za-z0-9]{20,})/g, "gho_***REDACTED***"],
  [/(xox[baprs]-[A-Za-z0-9-]{10,})/g, "xox***REDACTED***"],
  [/(AKIA[0-9A-Z]{16})/g, "AKIA***REDACTED***"],
  [/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, "***JWT_REDACTED***"],
  [
    /((?:api[_-]?key|secret|token|password|passwd|authorization|bearer)\s*[:=]\s*)(["']?)([^\s"',}]{6,})\2/gi,
    "$1$2***REDACTED***$2",
  ],
];

export function redactSecrets(text: string): string {
  let output = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}
