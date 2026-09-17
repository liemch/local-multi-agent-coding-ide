import { describe, expect, it } from "vitest";
import {
  detectProviderFailure,
  detectTaskError,
  parseTouchedFiles,
  parseUsage,
  stripAnsi,
} from "@/lib/agents/parse";

describe("stripAnsi", () => {
  it("removes colour escape sequences", () => {
    expect(stripAnsi("\u001B[31mred\u001B[0m")).toBe("red");
  });
});

describe("detectProviderFailure", () => {
  it("classifies quota exhaustion", () => {
    expect(detectProviderFailure("Error: you have exceeded your current quota")).toBe("quota_exhausted");
    expect(detectProviderFailure("credit balance is too low")).toBe("quota_exhausted");
  });

  it("classifies rate limiting", () => {
    expect(detectProviderFailure("HTTP 429 Too Many Requests")).toBe("rate_limit");
  });

  it("classifies auth problems", () => {
    expect(detectProviderFailure("401 Unauthorized: invalid api key")).toBe("authentication_error");
  });

  it("classifies provider outages", () => {
    expect(detectProviderFailure("503 service unavailable")).toBe("provider_unavailable");
    expect(detectProviderFailure("ECONNREFUSED")).toBe("provider_unavailable");
  });

  it("returns null for normal output", () => {
    expect(detectProviderFailure("Writing src/index.ts…")).toBeNull();
  });

  it("does not treat a failing test as a provider failure (plan §36)", () => {
    expect(detectProviderFailure("2 tests failed")).toBeNull();
  });
});

describe("detectTaskError", () => {
  it("recognises task-level failures that must not trigger failover", () => {
    expect(detectTaskError("3 failing")).toBe("test_failed");
    expect(detectTaskError("error TS2322: Type 'string' is not assignable")).toBe("compile_error");
    expect(detectTaskError("build failed")).toBe("build_failed");
  });

  it("returns null for provider errors", () => {
    expect(detectTaskError("rate limit exceeded, retry-after 30")).toBeNull();
  });
});

describe("parseUsage — honesty rule (plan §8 / rule #2)", () => {
  it("returns null when the CLI printed no usage information", () => {
    expect(parseUsage("Done. Modified 3 files.")).toBeNull();
    expect(parseUsage("")).toBeNull();
  });

  it("never invents a percentage", () => {
    const usage = parseUsage("resets in 30 minutes");
    expect(usage).not.toBeNull();
    expect(usage?.percentageUsed).toBeUndefined();
  });

  it("reads a real percentage", () => {
    const usage = parseUsage("Usage: 68% of your limit");
    expect(usage?.percentageUsed).toBe(68);
    expect(usage?.source).toBe("cli");
  });

  it("reads a remaining count", () => {
    const usage = parseUsage("remaining: 1,200 tokens");
    expect(usage?.remaining).toBe(1200);
  });

  it("reads an absolute reset timestamp", () => {
    const usage = parseUsage("Quota resets at 2026-01-02T03:04:05Z");
    expect(usage?.resetAt).toBeTruthy();
  });

  it("rejects an out-of-range percentage rather than storing nonsense", () => {
    const usage = parseUsage("used 999% of quota");
    expect(usage?.percentageUsed).toBeUndefined();
  });
});

describe("parseTouchedFiles", () => {
  it("picks file paths out of agent chatter", () => {
    const files = parseTouchedFiles("Edited src/app/page.tsx\nCreated src/lib/util.ts\n");
    expect(files).toContain("src/app/page.tsx");
    expect(files).toContain("src/lib/util.ts");
  });

  it("deduplicates", () => {
    const files = parseTouchedFiles("wrote a.ts\nwrote a.ts");
    expect(files.filter((f) => f === "a.ts").length).toBeLessThanOrEqual(1);
  });
});
