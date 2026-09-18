import {
  type AgentAdapter,
  type AgentEvent,
  type AgentHealth,
  type AgentId,
  type AgentResumeInput,
  type AgentRunInput,
  type AgentSession,
  type AgentUsage,
  UNKNOWN_USAGE,
} from "./types";
import { detectBinary, runCommand } from "./detect";
import { parseGenericEvent } from "./parse";
import { createTerminalSession, killSession, writeToSession } from "../terminal";

/**
 * Shared adapter behaviour. Vendor specifics (argv, usage command, extra output
 * patterns) are overridden by each subclass — plan §14, coding rule #6.
 */
export abstract class BaseAgentAdapter implements AgentAdapter {
  abstract id: AgentId;
  abstract displayName: string;
  abstract binary: string;

  async detect(): Promise<boolean> {
    return (await this.health()).installed;
  }

  async getVersion(): Promise<string | null> {
    return (await this.health()).version ?? null;
  }

  async health(): Promise<AgentHealth> {
    return detectBinary(this.binary);
  }

  /**
   * Default: we cannot know the quota, so report `unknown` (plan §19).
   * Subclasses override when their CLI exposes a real usage command.
   */
  async usage(): Promise<AgentUsage> {
    return UNKNOWN_USAGE;
  }

  /** argv for a fresh run. */
  buildArgs(_input: AgentRunInput): string[] {
    return [];
  }

  /** argv when resuming a provider session, if the CLI supports it. */
  buildResumeArgs(input: AgentResumeInput): string[] {
    return this.buildArgs(input);
  }

  /**
   * Whether the prompt should be typed into the CLI's stdin rather than passed
   * as an argv parameter (interactive REPL-style CLIs).
   */
  protected promptViaStdin(): boolean {
    return false;
  }

  protected async spawnCli(input: AgentRunInput, args: string[], title: string): Promise<AgentSession> {
    const meta = createTerminalSession({
      workspaceId: "", // assigned by the caller through the task runtime
      type: "agent",
      cwd: input.workspaceRoot,
      title,
      agent: this.id,
      taskId: input.taskId,
      command: this.binary,
      args,
      env: input.env,
    });

    if (this.promptViaStdin()) {
      // Give the CLI a moment to initialise its prompt before sending input.
      setTimeout(() => {
        writeToSession(meta.id, `${input.prompt.replace(/\r?\n/g, " ")}\r`);
      }, 1200);
    }

    return { terminalId: meta.id, real: true, providerSessionId: null };
  }

  async start(input: AgentRunInput): Promise<AgentSession> {
    return this.spawnCli(input, this.buildArgs(input), `${this.displayName} · ${input.taskId}`);
  }

  async resume(input: AgentResumeInput): Promise<AgentSession> {
    return this.spawnCli(input, this.buildResumeArgs(input), `${this.displayName} · ${input.taskId}`);
  }

  async stop(sessionId: string): Promise<void> {
    killSession(sessionId);
  }

  /** Vendor-specific extra patterns run before the generic parser. */
  protected parseVendorEvent(_raw: string): AgentEvent | null {
    return null;
  }

  parseEvent(raw: string): AgentEvent | null {
    return this.parseVendorEvent(raw) ?? parseGenericEvent(raw);
  }

  /** Helper for subclasses that expose a usage/status subcommand. */
  protected async usageFromCommand(
    args: string[],
    parser: (text: string) => AgentUsage | null,
  ): Promise<AgentUsage> {
    const health = await this.health();
    if (!health.installed) return UNKNOWN_USAGE;
    const res = await runCommand(this.binary, args, { timeout: 8000 });
    const text = `${res.stdout}\n${res.stderr}`;
    return parser(text) ?? UNKNOWN_USAGE;
  }
}
