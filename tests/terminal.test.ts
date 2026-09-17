import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  createTerminalSession,
  disposeSession,
  getBuffer,
  getCommandLog,
  getSessionMeta,
  killSession,
  listSessions,
  ptyBackend,
  resizeSession,
  subscribeSession,
  writeToSession,
} from "@/lib/terminal";

/**
 * These tests drive a REAL pty (plan rule #3: no fake terminal).
 * They spawn an actual shell and assert on its actual output.
 */

function waitFor(predicate: () => boolean, timeout = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeout) return reject(new Error("timeout"));
      setTimeout(tick, 50);
    };
    tick();
  });
}

describe("pty backend", () => {
  it("reports a real backend, never a stub", () => {
    const backend = ptyBackend();
    expect(["node-pty", "python"]).toContain(backend);
  });
});

describe("terminal session lifecycle", () => {
  it("runs an actual command in a real shell and returns its real output", async () => {
    const session = createTerminalSession({
      workspaceId: "ws-term-1",
      type: "shell",
      cwd: os.tmpdir(),
      title: "test shell",
    });

    let output = "";
    let exitCode: number | null = null;
    const unsubscribe = subscribeSession(
      session.id,
      (chunk) => {
        output += chunk;
      },
      (code) => {
        exitCode = code;
      },
    );

    writeToSession(session.id, "echo IDE_MARKER_42\n");
    await waitFor(() => output.includes("IDE_MARKER_42") || getBuffer(session.id).includes("IDE_MARKER_42"));

    expect(`${output}${getBuffer(session.id)}`).toContain("IDE_MARKER_42");

    unsubscribe();
    expect(exitCode).toBeNull();
    killSession(session.id);
    disposeSession(session.id);
  }, 20000);

  it("computes a real result rather than echoing back a canned string", async () => {
    const session = createTerminalSession({
      workspaceId: "ws-term-2",
      type: "shell",
      cwd: os.tmpdir(),
      title: "math",
    });

    writeToSession(session.id, "expr 6 \\* 7\n");
    await waitFor(() => getBuffer(session.id).includes("42"));
    expect(getBuffer(session.id)).toContain("42");

    killSession(session.id);
    disposeSession(session.id);
  }, 20000);

  it("tracks metadata, command log, and listing", async () => {
    const session = createTerminalSession({
      workspaceId: "ws-term-3",
      type: "shell",
      cwd: os.tmpdir(),
      title: "meta",
      taskId: "TASK-123",
    });

    const meta = getSessionMeta(session.id);
    expect(meta?.status).toBe("running");
    expect(meta?.taskId).toBe("TASK-123");
    expect(typeof meta?.pid).toBe("number");
    expect(listSessions("ws-term-3").map((item) => item.id)).toContain(session.id);

    writeToSession(session.id, "echo logged\n");
    await waitFor(() => getCommandLog(session.id).some((entry) => entry.includes("echo logged")));
    expect(getCommandLog(session.id).some((entry) => entry.includes("echo logged"))).toBe(true);

    killSession(session.id);
    disposeSession(session.id);
  }, 20000);

  it("resizes without throwing and marks the session exited on kill", async () => {
    const session = createTerminalSession({
      workspaceId: "ws-term-4",
      type: "shell",
      cwd: os.tmpdir(),
      title: "resize",
    });

    expect(() => resizeSession(session.id, 120, 40)).not.toThrow();

    killSession(session.id);
    await waitFor(() => getSessionMeta(session.id)?.status !== "running", 10000).catch(() => {});
    expect(getSessionMeta(session.id)?.status).not.toBe("running");

    disposeSession(session.id);
    expect(getSessionMeta(session.id)).toBeUndefined();
  }, 20000);

  it("ignores writes to an unknown session instead of crashing the route", () => {
    expect(() => writeToSession("does-not-exist", "hi\n")).not.toThrow();
    expect(() => resizeSession("does-not-exist", 80, 24)).not.toThrow();
    expect(getSessionMeta("does-not-exist")).toBeUndefined();
  });
});
