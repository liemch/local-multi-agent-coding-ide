import type { AgentEvent, AgentUsage, FailoverReason, TaskErrorReason } from "./types";

/**
 * Shared, provider-agnostic signal detection over CLI output.
 * Adapters layer their own vendor-specific patterns on top of this.
 *
 * Rule #8: a percentage is only ever reported when the CLI actually printed one.
 */

const ANSI_PATTERN = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "");
}

interface Signal {
  reason: FailoverReason;
  patterns: RegExp[];
}

const PROVIDER_FAILURE_SIGNALS: Signal[] = [
  {
    reason: "quota_exhausted",
    patterns: [
      /quota[_\s-]?exhausted/i,
      /quota (?:has been )?exceeded/i,
      /exceeded your current quota/i,
      /out of (?:credits|tokens|quota)/i,
      /insufficient[_\s-]?quota/i,
      /usage limit reached/i,
      /you(?:'ve| have) (?:hit|reached) your (?:usage )?limit/i,
      /monthly limit reached/i,
      /credit balance is too low/i,
      /billing[_\s-]?hard[_\s-]?limit[_\s-]?reached/i,
    ],
  },
  {
    reason: "rate_limit",
    patterns: [
      /rate[_\s-]?limit(?:ed|_error)?/i,
      /too many requests/i,
      /\b429\b/,
      /retry[- ]after/i,
      /slow down/i,
    ],
  },
  {
    reason: "authentication_error",
    patterns: [
      /authentication[_\s-]?(?:error|failed)/i,
      /unauthorized/i,
      /\b401\b/,
      /\b403\b/,
      /invalid api[_\s-]?key/i,
      /not logged in/i,
      /please (?:run )?login/i,
      /session (?:has )?expired/i,
      /credentials (?:are )?(?:invalid|missing)/i,
    ],
  },
  {
    reason: "provider_unavailable",
    patterns: [
      /\b50[023]\b/,
      /service unavailable/i,
      /server (?:is )?overloaded/i,
      /overloaded_error/i,
      /upstream (?:error|timeout)/i,
      /connection (?:refused|reset)/i,
      /network (?:error|unreachable)/i,
      /ENOTFOUND|ECONNREFUSED|ETIMEDOUT/,
    ],
  },
];

/** Task-level failures — these must never cause a failover (plan §36). */
const TASK_ERROR_SIGNALS: Array<{ reason: TaskErrorReason; patterns: RegExp[] }> = [
  { reason: "test_failed", patterns: [/\btests? failed\b/i, /\d+ failing/i, /assertion(?:error)? failed/i, /✗|✖/] },
  { reason: "compile_error", patterns: [/\bTS\d{4,5}\b/, /compile[rd]? error/i, /SyntaxError/i, /cannot find name/i] },
  { reason: "build_failed", patterns: [/build failed/i, /webpack.*error/i, /\bELIFECYCLE\b/] },
  { reason: "lint_error", patterns: [/\beslint\b.*\berror\b/i, /lint(?:ing)? (?:failed|error)/i] },
];

export function detectProviderFailure(text: string): FailoverReason | null {
  const clean = stripAnsi(text);
  for (const signal of PROVIDER_FAILURE_SIGNALS) {
    if (signal.patterns.some((pattern) => pattern.test(clean))) return signal.reason;
  }
  return null;
}

export function detectTaskError(text: string): TaskErrorReason | null {
  const clean = stripAnsi(text);
  for (const signal of TASK_ERROR_SIGNALS) {
    if (signal.patterns.some((pattern) => pattern.test(clean))) return signal.reason;
  }
  return null;
}

/**
 * Extracts a usage reading only when the CLI genuinely printed one.
 * Returns null otherwise so callers fall back to `unknown` (never fabricate).
 */
export function parseUsage(text: string): AgentUsage | null {
  const clean = stripAnsi(text);

  // e.g. "usage: 68%", "82% of your limit used", "quota used: 45 %"
  const percentMatch =
    clean.match(/(?:usage|used|quota|limit)[^0-9%]{0,24}?(\d{1,3}(?:\.\d+)?)\s?%/i) ??
    clean.match(/(\d{1,3}(?:\.\d+)?)\s?%\s*(?:of\s+)?(?:your\s+)?(?:usage|quota|limit|used)/i);

  // e.g. "remaining: 1200 tokens", "1200 requests remaining"
  const remainingMatch =
    clean.match(/remaining[^0-9]{0,16}(\d[\d,._]*)/i) ?? clean.match(/(\d[\d,._]*)\s+(?:tokens?|requests?)\s+remaining/i);

  // e.g. "resets at 2026-01-02T03:04:05Z", "reset in 12 minutes"
  const resetIsoMatch = clean.match(/reset[^0-9]{0,16}(\d{4}-\d{2}-\d{2}[T\s][\d:]+(?:Z|[+-]\d{2}:?\d{2})?)/i);
  const resetInMatch = clean.match(/reset[s]?\s+in\s+(\d+)\s*(second|minute|hour)s?/i);

  if (!percentMatch && !remainingMatch && !resetIsoMatch && !resetInMatch) return null;

  const usage: AgentUsage = { status: "available", source: "cli" };

  if (percentMatch) {
    const percentage = Number.parseFloat(percentMatch[1]);
    if (Number.isFinite(percentage) && percentage >= 0 && percentage <= 100) {
      usage.percentageUsed = Math.round(percentage);
    }
  }

  if (remainingMatch) {
    const remaining = Number.parseInt(remainingMatch[1].replace(/[,._]/g, ""), 10);
    if (Number.isFinite(remaining)) usage.remaining = remaining;
  }

  if (resetIsoMatch) {
    const date = new Date(resetIsoMatch[1]);
    if (!Number.isNaN(date.getTime())) usage.resetAt = date.toISOString();
  } else if (resetInMatch) {
    const amount = Number.parseInt(resetInMatch[1], 10);
    const unit = resetInMatch[2].toLowerCase();
    const factor = unit === "hour" ? 3_600_000 : unit === "minute" ? 60_000 : 1000;
    usage.resetAt = new Date(Date.now() + amount * factor).toISOString();
  }

  return usage;
}

/** Recognises common "agent touched a file" lines so the UI can show real activity. */
export function parseTouchedFiles(text: string): string[] {
  const clean = stripAnsi(text);
  const files = new Set<string>();
  const patterns = [
    /(?:^|\s)(?:edited|wrote|writing|updated|created|modified|patching|patched)\s+([\w./@-]+\.[\w]{1,8})/gi,
    /^(?:[+-]{3})\s+[ab]\/([\w./@-]+)/gm,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(clean)) !== null) {
      if (match[1]) files.add(match[1]);
    }
  }
  return [...files];
}

/**
 * Turns a raw output chunk into a structured event.
 * Returns null when the chunk carries no meaningful signal.
 */
export function parseGenericEvent(raw: string): AgentEvent | null {
  const clean = stripAnsi(raw).trim();
  if (!clean) return null;

  const failoverReason = detectProviderFailure(clean);
  if (failoverReason) {
    return {
      type: "provider_error",
      message: clean.slice(0, 500),
      failoverReason,
      usage:
        failoverReason === "quota_exhausted"
          ? { status: "quota_exhausted", source: "error_detection" }
          : failoverReason === "rate_limit"
            ? { status: "rate_limited", source: "error_detection" }
            : undefined,
      raw,
    };
  }

  const taskErrorReason = detectTaskError(clean);
  if (taskErrorReason) {
    return { type: "task_error", message: clean.slice(0, 500), taskErrorReason, raw };
  }

  const usage = parseUsage(clean);
  if (usage) {
    return { type: "usage", message: clean.slice(0, 200), usage, raw };
  }

  const files = parseTouchedFiles(clean);
  if (files.length) {
    return { type: "file_change", message: clean.slice(0, 200), files, raw };
  }

  return null;
}
