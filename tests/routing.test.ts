import { describe, expect, it } from "vitest";
import {
  isAgentUsable,
  isFailoverReason,
  isTaskError,
  pickNextAgent,
  scoreAgent,
  shouldPreemptivelyHandoff,
  taskCompatibility,
  type AgentRuntimeState,
} from "@/lib/routing";
import type { AgentId } from "@/lib/agents/types";

function state(id: AgentId, overrides: Partial<AgentRuntimeState> = {}): AgentRuntimeState {
  return {
    id,
    installed: true,
    enabled: true,
    usageStatus: "available",
    recentFailures: 0,
    hasUsableAccount: true,
    ...overrides,
  };
}

function table(...entries: AgentRuntimeState[]): Record<AgentId, AgentRuntimeState> {
  const base: Record<AgentId, AgentRuntimeState> = {
    codex: state("codex"),
    claude: state("claude"),
    antigravity: state("antigravity"),
  };
  for (const entry of entries) base[entry.id] = entry;
  return base;
}

describe("failure classification", () => {
  it("separates provider failures from task errors (plan §36)", () => {
    expect(isFailoverReason("quota_exhausted")).toBe(true);
    expect(isFailoverReason("rate_limit")).toBe(true);
    expect(isTaskError("test_failed")).toBe(true);
  });

  it("never treats a task error as a failover reason", () => {
    expect(isFailoverReason("test_failed")).toBe(false);
    expect(isFailoverReason("compile_error")).toBe(false);
  });
});

describe("isAgentUsable", () => {
  it("accepts a healthy agent", () => {
    expect(isAgentUsable(state("codex"))).toBe(true);
  });

  it("rejects uninstalled, disabled, accountless, or throttled agents", () => {
    expect(isAgentUsable(state("codex", { installed: false }))).toBe(false);
    expect(isAgentUsable(state("codex", { enabled: false }))).toBe(false);
    expect(isAgentUsable(state("codex", { hasUsableAccount: false }))).toBe(false);
    expect(isAgentUsable(state("codex", { usageStatus: "quota_exhausted" }))).toBe(false);
    expect(isAgentUsable(state("codex", { usageStatus: "rate_limited" }))).toBe(false);
    expect(isAgentUsable(undefined)).toBe(false);
  });

  it("still allows an agent whose quota is simply unknown", () => {
    expect(isAgentUsable(state("codex", { usageStatus: "unknown" }))).toBe(true);
  });
});

describe("scoreAgent", () => {
  it("prefers a fresh agent over a heavily used one", () => {
    const healthy = scoreAgent(state("codex", { percentageUsed: 5 }), 0, "implement");
    const strained = scoreAgent(state("codex", { usageStatus: "warning", percentageUsed: 92 }), 0, "implement");
    expect(healthy).toBeGreaterThan(strained);
  });

  it("scores unknown quota conservatively (0.8) rather than inventing a number", () => {
    const unknown = scoreAgent(state("codex", { usageStatus: "unknown" }), 0, "implement");
    const full = scoreAgent(state("codex", { percentageUsed: 0 }), 0, "implement");
    expect(unknown).toBeLessThan(full);
    expect(unknown).toBeGreaterThan(0.5);
  });

  it("penalises recent failures", () => {
    expect(scoreAgent(state("codex"), 0)).toBeGreaterThan(scoreAgent(state("codex", { recentFailures: 3 }), 0));
  });

  it("penalises a lower user priority", () => {
    expect(scoreAgent(state("codex"), 0)).toBeGreaterThan(scoreAgent(state("codex"), 2));
  });

  it("returns -1 for an unusable agent so it can never win", () => {
    expect(scoreAgent(state("codex", { installed: false }), 0)).toBe(-1);
  });
});

describe("taskCompatibility", () => {
  it("keeps every weight inside 0..1", () => {
    for (const agent of ["codex", "claude", "antigravity"] as AgentId[]) {
      for (const mode of ["plan", "implement", "fix", "review"] as const) {
        const value = taskCompatibility(agent, mode);
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("favours Claude for planning and Codex for implementation", () => {
    expect(taskCompatibility("claude", "plan")).toBeGreaterThan(taskCompatibility("codex", "plan"));
    expect(taskCompatibility("codex", "implement")).toBeGreaterThan(taskCompatibility("claude", "implement"));
  });
});

describe("pickNextAgent", () => {
  it("honours the configured order in priority mode", () => {
    expect(pickNextAgent(table(), { mode: "priority", priority: ["claude", "codex", "antigravity"] })).toBe("claude");
  });

  it("never re-picks an excluded agent (used on failover)", () => {
    const picked = pickNextAgent(table(), {
      mode: "priority",
      priority: ["claude", "codex", "antigravity"],
      exclude: ["claude"],
    });
    expect(picked).not.toBe("claude");
    expect(picked).toBeTruthy();
  });

  it("skips unusable agents in smart mode", () => {
    const picked = pickNextAgent(
      table(state("codex", { installed: false }), state("antigravity", { enabled: false })),
      { mode: "smart", priority: ["codex", "claude", "antigravity"] },
    );
    expect(picked).toBe("claude");
  });

  it("returns null when nothing is usable instead of guessing", () => {
    const picked = pickNextAgent(
      table(
        state("codex", { installed: false }),
        state("claude", { installed: false }),
        state("antigravity", { installed: false }),
      ),
      { mode: "smart", priority: ["codex"] },
    );
    expect(picked).toBeNull();
  });

  it("manual mode only ever returns the preferred agent", () => {
    expect(pickNextAgent(table(), { mode: "manual", priority: [], preferred: "antigravity" })).toBe("antigravity");
    expect(pickNextAgent(table(), { mode: "manual", priority: [], preferred: null })).toBeNull();
    expect(
      pickNextAgent(table(state("claude", { usageStatus: "quota_exhausted" })), {
        mode: "manual",
        priority: [],
        preferred: "claude",
      }),
    ).toBeNull();
  });
});

describe("shouldPreemptivelyHandoff (plan §37)", () => {
  it("triggers above the threshold when a healthier agent exists", () => {
    const current = state("codex", { usageStatus: "warning", percentageUsed: 90 });
    const states = table(current, state("claude", { percentageUsed: 10 }));
    expect(shouldPreemptivelyHandoff(current, states, 85)).toBe(true);
  });

  it("stays quiet below the threshold", () => {
    const current = state("codex", { percentageUsed: 40 });
    expect(shouldPreemptivelyHandoff(current, table(current), 85)).toBe(false);
  });

  it("never triggers on unknown usage — we do not guess (rule #2)", () => {
    const current = state("codex", { usageStatus: "unknown" });
    expect(shouldPreemptivelyHandoff(current, table(current), 85)).toBe(false);
  });

  it("does not hand off when every alternative is just as strained", () => {
    const current = state("codex", { usageStatus: "warning", percentageUsed: 90 });
    const states = table(
      current,
      state("claude", { usageStatus: "warning", percentageUsed: 89 }),
      state("antigravity", { usageStatus: "quota_exhausted" }),
    );
    expect(shouldPreemptivelyHandoff(current, states, 85)).toBe(false);
  });
});
