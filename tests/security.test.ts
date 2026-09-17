import { describe, expect, it } from "vitest";
import {
  analyzeCommandLine,
  detectDangerousCommand,
  isSensitiveFile,
  redactSecrets,
  requiresConfirmation,
  splitCommandChain,
} from "@/lib/security-shared";

describe("isSensitiveFile", () => {
  it("flags credential files", () => {
    for (const name of [".env", ".env.local", "id_rsa", "credentials.json", "secrets.yaml", "config.pem"]) {
      expect(isSensitiveFile(name), name).toBe(true);
    }
  });

  it("does not flag example env files (plan §63)", () => {
    expect(isSensitiveFile(".env.example")).toBe(false);
    expect(isSensitiveFile(".env.sample")).toBe(false);
  });

  it("does not flag ordinary source files", () => {
    expect(isSensitiveFile("index.ts")).toBe(false);
    expect(isSensitiveFile("README.md")).toBe(false);
  });
});

describe("detectDangerousCommand", () => {
  it("detects destructive filesystem commands", () => {
    expect(detectDangerousCommand("rm -rf /")).not.toBeNull();
    expect(detectDangerousCommand("sudo rm -rf ~/")).not.toBeNull();
    expect(detectDangerousCommand("mkfs.ext4 /dev/sda1")).not.toBeNull();
  });

  it("detects destructive git commands", () => {
    expect(detectDangerousCommand("git push --force origin main")).not.toBeNull();
    expect(detectDangerousCommand("git reset --hard HEAD~5")).not.toBeNull();
  });

  it("leaves harmless commands alone", () => {
    expect(detectDangerousCommand("npm run dev")).toBeNull();
    expect(detectDangerousCommand("ls -la")).toBeNull();
    expect(detectDangerousCommand("git status")).toBeNull();
  });
});

describe("splitCommandChain", () => {
  it("splits on chaining operators", () => {
    expect(splitCommandChain("npm ci && rm -rf / ; echo done")).toEqual(["npm ci", "rm -rf /", "echo done"]);
  });

  it("finds a dangerous command hidden behind a chain", () => {
    const parts = splitCommandChain("echo hi && sudo rm -rf /");
    expect(parts.some((part) => detectDangerousCommand(part))).toBe(true);
  });
});

describe("requiresConfirmation / permission modes", () => {
  it("safe mode also asks for write and install commands", () => {
    expect(requiresConfirmation("npm install left-pad", "safe")).toBe(true);
    expect(requiresConfirmation("npm install left-pad", "balanced")).toBe(false);
  });

  it("every mode still asks for genuinely dangerous commands", () => {
    for (const mode of ["safe", "balanced", "auto"] as const) {
      expect(requiresConfirmation("rm -rf /", mode), mode).toBe(true);
    }
  });

  it("auto mode lets normal commands through", () => {
    expect(requiresConfirmation("npm test", "auto")).toBe(false);
  });
});

describe("analyzeCommandLine", () => {
  it("respects the always-allow list", () => {
    const line = "git push --force origin feature";
    expect(analyzeCommandLine(line, "balanced", [])).not.toBeNull();
    expect(analyzeCommandLine(line, "balanced", [line])).toBeNull();
  });

  it("returns the matched rule so the UI can explain why", () => {
    const result = analyzeCommandLine("rm -rf /", "balanced", []);
    expect(result).not.toBeNull();
    expect(result?.dangerous?.description).toBeTruthy();
    expect(result?.command).toBe("rm -rf /");
  });

  it("flags a dangerous command hidden after a safe one", () => {
    const result = analyzeCommandLine("npm test && sudo rm -rf /tmp/x", "balanced", []);
    expect(result?.dangerous).not.toBeNull();
  });

  it("returns null for a completely safe line", () => {
    expect(analyzeCommandLine("npm run build", "balanced", [])).toBeNull();
  });
});

describe("redactSecrets", () => {
  it("masks api keys and tokens before they reach the event log", () => {
    const redacted = redactSecrets('OPENAI_API_KEY=sk-abcdef1234567890abcdef Authorization: Bearer xyz.123');
    expect(redacted).not.toContain("sk-abcdef1234567890abcdef");
    expect(redacted.toLowerCase()).toContain("redacted");
  });

  it("keeps ordinary text intact", () => {
    expect(redactSecrets("hello world")).toBe("hello world");
  });
});
