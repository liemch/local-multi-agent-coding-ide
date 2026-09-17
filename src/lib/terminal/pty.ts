import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

/**
 * Real PTY runtime (plan §13, coding rule #3/#4 — never fake the terminal).
 *
 * Preferred backend: `node-pty` (native).
 * Fallback backend: a tiny Python `pty` bridge, used when node-pty could not be
 * compiled (no toolchain / offline install). Both give a genuine kernel PTY, so
 * interactive programs, ANSI colours and resize all behave correctly.
 */

export interface PtyProcess {
  pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface SpawnPtyOptions {
  file: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export type PtyBackend = "node-pty" | "python";

let cachedBackend: PtyBackend | null = null;

type NodePtyModule = {
  spawn: (file: string, args: string[], opts: Record<string, unknown>) => PtyProcess;
};

function loadNodePty(): NodePtyModule | null {
  try {
    const mod = require("node-pty") as NodePtyModule;
    if (mod && typeof mod.spawn === "function") return mod;
    return null;
  } catch {
    return null;
  }
}

export function detectBackend(): PtyBackend {
  if (cachedBackend) return cachedBackend;
  cachedBackend = loadNodePty() ? "node-pty" : "python";
  return cachedBackend;
}

/** Path to the Python PTY bridge script shipped with the runtime. */
function bridgeScript(): string {
  return path.join(process.cwd(), "scripts", "pty_bridge.py");
}

/**
 * Python-backed PTY. Control messages are sent on the child's stdin using a
 * length-prefixed framing so that binary-safe keystrokes and resize commands
 * can share one channel:
 *   I<len>\n<payload>   -> input bytes
 *   R<cols>,<rows>\n    -> resize
 */
class PythonPty implements PtyProcess {
  readonly pid: number;
  private child: ChildProcessWithoutNullStreams;
  private dataHandlers = new Set<(data: string) => void>();
  private exitHandlers = new Set<(event: { exitCode: number; signal?: number }) => void>();
  private decoder = new TextDecoder("utf-8", { fatal: false });

  constructor(options: SpawnPtyOptions) {
    const { file, args = [], cwd, env, cols = 100, rows = 30 } = options;

    this.child = spawn(
      "python3",
      [bridgeScript(), String(cols), String(rows), file, ...args],
      {
        cwd,
        env: { ...process.env, ...env } as NodeJS.ProcessEnv,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ) as ChildProcessWithoutNullStreams;

    this.pid = this.child.pid ?? -1;

    this.child.stdout.on("data", (chunk: Buffer) => {
      const text = this.decoder.decode(chunk, { stream: true });
      if (!text) return;
      for (const handler of this.dataHandlers) handler(text);
    });

    this.child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      if (!text.trim()) return;
      for (const handler of this.dataHandlers) handler(text);
    });

    this.child.on("exit", (code, signal) => {
      for (const handler of this.exitHandlers) {
        handler({ exitCode: code ?? 0, signal: signal ? 1 : undefined });
      }
    });

    this.child.on("error", (error) => {
      for (const handler of this.dataHandlers) {
        handler(`\r\n[pty] ${error.message}\r\n`);
      }
      for (const handler of this.exitHandlers) handler({ exitCode: 1 });
    });
  }

  onData(cb: (data: string) => void) {
    this.dataHandlers.add(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void) {
    this.exitHandlers.add(cb);
  }

  write(data: string) {
    if (this.child.killed || !this.child.stdin.writable) return;
    const payload = Buffer.from(data, "utf-8");
    this.child.stdin.write(`I${payload.length}\n`);
    this.child.stdin.write(payload);
  }

  resize(cols: number, rows: number) {
    if (this.child.killed || !this.child.stdin.writable) return;
    this.child.stdin.write(`R${cols},${rows}\n`);
  }

  kill(signal?: string) {
    try {
      this.child.kill((signal as NodeJS.Signals) ?? "SIGTERM");
    } catch {
      // already gone
    }
  }
}

export function spawnPty(options: SpawnPtyOptions): { pty: PtyProcess; backend: PtyBackend } {
  const nodePty = loadNodePty();
  const { file, args = [], cwd, env, cols = 100, rows = 30 } = options;

  if (nodePty) {
    const pty = nodePty.spawn(file, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...process.env, ...env, TERM: "xterm-256color" },
    });
    return { pty, backend: "node-pty" };
  }

  return { pty: new PythonPty(options), backend: "python" };
}
