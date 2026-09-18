import { describe, expect, it } from "vitest";
import { AntigravityAdapter, ClaudeAdapter, CodexAdapter, getAdapter } from "@/lib/agents/adapters";
import { AGENT_IDS, UNKNOWN_USAGE, type AgentId } from "@/lib/agents/types";
import { detectBinary, findBinaryPath, clearDetectionCache } from "@/lib/agents/detect";

/** Rule #4: every agent goes through the adapter layer, never a hard-coded branch. */

describe("adapter registry", () => {
  it("provides an adapter for every known agent", () => {
    for (const id of AGENT_IDS) {
      const adapter = getAdapter(id as AgentId);
      expect(adapter, id).toBeTruthy();
      expect(adapter.id).toBe(id);
      expect(typeof adapter.binary).toBe("string");
    }
  });

  it("exposes the full contract on each adapter", () => {
    for (const id of AGENT_IDS) {
      const adapter = getAdapter(id as AgentId);
      for (const method of ["buildArgs", "buildResumeArgs", "usage", "health", "parseEvent", "start", "stop"]) {
        expect(typeof (adapter as unknown as Record<string, unknown>)[method], `${id}.${method}`).toBe("function");
      }
    }
  });
});

describe("argv construction", () => {
  const prompt = "Thêm endpoint /health";

  it("codex runs non-interactively and can resume a session", () => {
    const adapter = new CodexAdapter();
    expect(adapter.buildArgs({ prompt, workspaceRoot: "/tmp", taskId: "TASK-1" })).toEqual([
      "exec",
      "--skip-git-repo-check",
      prompt,
    ]);
    expect(
      adapter.buildResumeArgs({ prompt, workspaceRoot: "/tmp", taskId: "TASK-1", providerSessionId: "sess-1" }),
    ).toEqual(["exec", "resume", "sess-1", "--skip-git-repo-check", prompt]);
  });

  it("codex falls back to a fresh run when there is no session id", () => {
    const adapter = new CodexAdapter();
    const args = adapter.buildResumeArgs({ prompt, workspaceRoot: "/tmp", taskId: "TASK-1", providerSessionId: null });
    expect(args).toEqual(["exec", "--skip-git-repo-check", prompt]);
  });

  it("claude resumes with --resume", () => {
    const adapter = new ClaudeAdapter();
    const args = adapter.buildResumeArgs({ prompt, workspaceRoot: "/tmp", taskId: "TASK-1", providerSessionId: "abc" });
    expect(args).toContain("--resume");
    expect(args).toContain("abc");
    expect(args).toContain("--print");
  });

  it("antigravity resumes with --session", () => {
    const adapter = new AntigravityAdapter();
    const args = adapter.buildResumeArgs({ prompt, workspaceRoot: "/tmp", taskId: "TASK-1", providerSessionId: "xyz" });
    expect(args).toEqual(["run", "--session", "xyz", "--prompt", prompt]);
  });

  it("always passes the prompt through verbatim", () => {
    for (const adapter of [new CodexAdapter(), new ClaudeAdapter(), new AntigravityAdapter()]) {
      expect(adapter.buildArgs({ prompt, workspaceRoot: "/tmp", taskId: "T" }), adapter.id).toContain(prompt);
    }
  });
});

describe("usage honesty (rule #2)", () => {
  it("codex reports unknown rather than a made-up number", async () => {
    const usage = await new CodexAdapter().usage();
    expect(usage).toEqual(UNKNOWN_USAGE);
    expect(usage.percentageUsed).toBeUndefined();
  });

  it("agents that are not installed still report unknown, not zero", async () => {
    for (const adapter of [new ClaudeAdapter(), new AntigravityAdapter()]) {
      const usage = await adapter.usage();
      if (usage.status === "unknown") {
        expect(usage.percentageUsed).toBeUndefined();
      }
    }
  });
});

describe("event parsing", () => {
  it("claude turns a real quota message into a failover signal", () => {
    const event = new ClaudeAdapter().parseEvent("Claude usage limit reached — 5-hour limit reached");
    expect(event?.type).toBe("provider_error");
    expect(event?.failoverReason).toBe("quota_exhausted");
  });

  it("codex surfaces the session id so the task can be resumed later", () => {
    const event = new CodexAdapter().parseEvent("session_id: abc123def");
    expect(event?.message).toContain("abc123def");
  });

  it("a failing test is never reported as a provider error", () => {
    for (const adapter of [new CodexAdapter(), new ClaudeAdapter(), new AntigravityAdapter()]) {
      const event = adapter.parseEvent("FAIL src/foo.test.ts — 2 tests failed");
      expect(event?.failoverReason, adapter.id).toBeFalsy();
    }
  });
});

describe("binary detection", () => {
  it("reports a binary that genuinely exists", async () => {
    clearDetectionCache();
    const health = await detectBinary("node");
    expect(health.installed).toBe(true);
    expect(health.binaryPath).toBeTruthy();
  });

  it("reports a missing binary as not installed (no pretending)", async () => {
    clearDetectionCache();
    const health = await detectBinary("definitely-not-a-real-binary-xyz");
    expect(health.installed).toBe(false);
    expect(health.version ?? null).toBeNull();
  });

  it("findBinaryPath returns null for a missing binary", async () => {
    expect(await findBinaryPath("definitely-not-a-real-binary-xyz")).toBeNull();
  });
});
