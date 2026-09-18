import { BaseAgentAdapter } from "./base-adapter";
import { parseUsage, stripAnsi } from "./parse";
import {
  type AgentAdapter,
  type AgentEvent,
  type AgentId,
  type AgentResumeInput,
  type AgentRunInput,
  type AgentUsage,
  UNKNOWN_USAGE,
} from "./types";

/**
 * Codex CLI adapter.
 * Non-interactive execution keeps output streaming and avoids a REPL we cannot drive.
 */
export class CodexAdapter extends BaseAgentAdapter {
  id: AgentId = "codex";
  displayName = "Codex";
  binary = "codex";

  buildArgs(input: AgentRunInput): string[] {
    return ["exec", "--skip-git-repo-check", input.prompt];
  }

  buildResumeArgs(input: AgentResumeInput): string[] {
    if (input.providerSessionId) {
      return ["exec", "resume", input.providerSessionId, "--skip-git-repo-check", input.prompt];
    }
    return this.buildArgs(input);
  }

  async usage(): Promise<AgentUsage> {
    // `codex` has no stable machine-readable quota command; stay honest.
    return UNKNOWN_USAGE;
  }

  protected parseVendorEvent(raw: string): AgentEvent | null {
    const clean = stripAnsi(raw);
    const sessionMatch = clean.match(/session[_\s-]?id[:\s]+([\w-]{6,})/i);
    if (sessionMatch) {
      return { type: "activity", message: `Codex session: ${sessionMatch[1]}`, raw };
    }
    return null;
  }
}

/**
 * Claude Code CLI adapter.
 * Supports real session resume via `--resume <id>`.
 */
export class ClaudeAdapter extends BaseAgentAdapter {
  id: AgentId = "claude";
  displayName = "Claude";
  binary = "claude";

  buildArgs(input: AgentRunInput): string[] {
    return ["--print", "--permission-mode", "acceptEdits", input.prompt];
  }

  buildResumeArgs(input: AgentResumeInput): string[] {
    if (input.providerSessionId) {
      return ["--print", "--resume", input.providerSessionId, "--permission-mode", "acceptEdits", input.prompt];
    }
    return this.buildArgs(input);
  }

  async usage(): Promise<AgentUsage> {
    // Ask the CLI; if it prints nothing parseable we report unknown.
    return this.usageFromCommand(["usage"], (text) => parseUsage(text));
  }

  protected parseVendorEvent(raw: string): AgentEvent | null {
    const clean = stripAnsi(raw);

    const sessionMatch = clean.match(/session[_\s-]?id["':\s]+([\w-]{6,})/i);
    if (sessionMatch) {
      return { type: "activity", message: `Claude session: ${sessionMatch[1]}`, raw };
    }

    // Claude surfaces limits in prose; treat it as a genuine quota signal.
    if (/\b5-hour limit reached\b/i.test(clean) || /\bapproaching (?:your )?usage limit\b/i.test(clean)) {
      return {
        type: "provider_error",
        message: clean.slice(0, 300),
        failoverReason: "quota_exhausted",
        usage: { status: "quota_exhausted", source: "error_detection" },
        raw,
      };
    }
    return null;
  }
}

/**
 * Antigravity CLI adapter.
 */
export class AntigravityAdapter extends BaseAgentAdapter {
  id: AgentId = "antigravity";
  displayName = "Antigravity";
  binary = "antigravity";

  buildArgs(input: AgentRunInput): string[] {
    return ["run", "--prompt", input.prompt];
  }

  buildResumeArgs(input: AgentResumeInput): string[] {
    if (input.providerSessionId) {
      return ["run", "--session", input.providerSessionId, "--prompt", input.prompt];
    }
    return this.buildArgs(input);
  }

  async usage(): Promise<AgentUsage> {
    return this.usageFromCommand(["usage", "--json"], (text) => {
      try {
        const data = JSON.parse(text) as {
          percentageUsed?: number;
          remaining?: number;
          resetAt?: string;
        };
        if (typeof data.percentageUsed !== "number" && typeof data.remaining !== "number") return null;
        return {
          status: "available",
          percentageUsed: data.percentageUsed,
          remaining: data.remaining,
          resetAt: data.resetAt,
          source: "cli",
        };
      } catch {
        return parseUsage(text);
      }
    });
  }
}

const registry: Record<AgentId, AgentAdapter> = {
  codex: new CodexAdapter(),
  claude: new ClaudeAdapter(),
  antigravity: new AntigravityAdapter(),
};

export function getAdapter(id: AgentId): AgentAdapter {
  return registry[id];
}

export function allAdapters(): AgentAdapter[] {
  return Object.values(registry);
}
