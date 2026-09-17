// Pure, isomorphic security helpers (no Node-only imports) so they can run
// both on the server and inside client components (e.g. the terminal UI).

export const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^credentials\.json$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /\.p12$/i,
  /\.pfx$/i,
];

export function isSensitiveFile(fileName: string): boolean {
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

export interface DangerousCommandMatch {
  pattern: string;
  description: string;
}

export const DANGEROUS_COMMAND_PATTERNS: DangerousCommandMatch[] = [
  { pattern: "rm\\s+-rf", description: "Xóa thư mục/đệ quy không thể khôi phục" },
  { pattern: "\\bsudo\\b", description: "Thực thi với quyền quản trị" },
  { pattern: "git\\s+reset\\s+--hard", description: "Xóa thay đổi chưa commit" },
  { pattern: "git\\s+clean\\s+-fd", description: "Xóa file chưa theo dõi" },
  { pattern: "git\\s+push\\s+.*--force", description: "Ghi đè lịch sử remote" },
  { pattern: "drop\\s+database", description: "Xóa toàn bộ database" },
  { pattern: "drop\\s+table", description: "Xóa bảng dữ liệu" },
  { pattern: "docker\\s+system\\s+prune", description: "Xóa dữ liệu Docker" },
  { pattern: ":\\(\\)\\s*\\{\\s*:\\|:", description: "Fork bomb" },
  { pattern: "mkfs\\.", description: "Định dạng ổ đĩa" },
  { pattern: ">\\s*/dev/sd", description: "Ghi đè thiết bị lưu trữ" },
  { pattern: "chmod\\s+-R\\s+777\\s+/", description: "Thay đổi quyền toàn hệ thống" },
];

export function detectDangerousCommand(command: string): DangerousCommandMatch | null {
  const lower = command.toLowerCase();
  for (const entry of DANGEROUS_COMMAND_PATTERNS) {
    const re = new RegExp(entry.pattern, "i");
    if (re.test(lower)) return entry;
  }
  return null;
}

export type PermissionMode = "safe" | "balanced" | "auto";

export function requiresConfirmation(command: string, mode: PermissionMode): boolean {
  const dangerous = detectDangerousCommand(command);
  if (dangerous) return true;
  if (mode === "safe") {
    return /\b(rm|mv|npm\s+i(nstall)?|yarn\s+add|pnpm\s+add)\b/i.test(command);
  }
  return false;
}
