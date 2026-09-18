import { randomUUID } from "node:crypto";
import { spawnPty, detectBackend, type PtyProcess, type PtyBackend } from "./pty";

export type TerminalType = "shell" | "agent" | "dev-server";

export interface TerminalMeta {
  id: string;
  workspaceId: string;
  taskId?: string;
  agent?: string;
  type: TerminalType;
  title: string;
  cwd: string;
  status: "running" | "stopped" | "exited";
  pid?: number;
  exitCode?: number;
  backend: PtyBackend;
  createdAt: number;
}

interface Session {
  meta: TerminalMeta;
  pty: PtyProcess;
  buffer: string;
  /** Commands typed/injected into this terminal, used for context capture. */
  commandLog: string[];
  pendingLine: string;
  listeners: Set<(chunk: string) => void>;
  exitListeners: Set<(code: number) => void>;
}

const MAX_BUFFER = 200_000;
const MAX_COMMAND_LOG = 200;

const globalStore = globalThis as typeof globalThis & {
  __ideTerminalSessions?: Map<string, Session>;
};

const sessions: Map<string, Session> = globalStore.__ideTerminalSessions ?? new Map();
globalStore.__ideTerminalSessions = sessions;

export function ptyBackend(): PtyBackend {
  return detectBackend();
}

export function createTerminalSession(opts: {
  workspaceId: string;
  type: TerminalType;
  cwd: string;
  title: string;
  agent?: string;
  taskId?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}): TerminalMeta {
  const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash";
  const file = opts.command ?? shell;
  const args = opts.args ?? (opts.command ? [] : ["-i"]);

  const { pty, backend } = spawnPty({
    file,
    args,
    cwd: opts.cwd,
    cols: opts.cols ?? 100,
    rows: opts.rows ?? 30,
    env: {
      ...opts.env,
      TERM: "xterm-256color",
      FORCE_COLOR: "1",
      // Keep agent CLIs from paging output into an interactive viewer.
      PAGER: "cat",
      GIT_PAGER: "cat",
    },
  });

  const id = randomUUID();
  const meta: TerminalMeta = {
    id,
    workspaceId: opts.workspaceId,
    type: opts.type,
    title: opts.title,
    cwd: opts.cwd,
    agent: opts.agent,
    taskId: opts.taskId,
    status: "running",
    pid: pty.pid,
    backend,
    createdAt: Date.now(),
  };

  const session: Session = {
    meta,
    pty,
    buffer: "",
    commandLog: [],
    pendingLine: "",
    listeners: new Set(),
    exitListeners: new Set(),
  };

  pty.onData((data: string) => {
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER);
    }
    for (const listener of session.listeners) listener(data);
  });

  pty.onExit(({ exitCode }) => {
    session.meta.status = "exited";
    session.meta.exitCode = exitCode;
    for (const listener of session.exitListeners) listener(exitCode);
  });

  sessions.set(id, session);
  return meta;
}

export function getSessionMeta(id: string): TerminalMeta | undefined {
  return sessions.get(id)?.meta;
}

export function listSessions(workspaceId?: string): TerminalMeta[] {
  return [...sessions.values()]
    .filter((s) => !workspaceId || s.meta.workspaceId === workspaceId)
    .map((s) => s.meta)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Tracks typed characters so we can recover whole commands for the context engine. */
function trackCommand(session: Session, data: string) {
  for (const char of data) {
    if (char === "\r" || char === "\n") {
      const command = session.pendingLine.trim();
      session.pendingLine = "";
      if (command) {
        session.commandLog.push(command);
        if (session.commandLog.length > MAX_COMMAND_LOG) session.commandLog.shift();
      }
    } else if (char === "\u007f") {
      session.pendingLine = session.pendingLine.slice(0, -1);
    } else if (char >= " ") {
      session.pendingLine += char;
    }
  }
}

export function writeToSession(id: string, data: string) {
  const session = sessions.get(id);
  if (!session || session.meta.status !== "running") return;
  trackCommand(session, data);
  session.pty.write(data);
}

export function resizeSession(id: string, cols: number, rows: number) {
  const session = sessions.get(id);
  if (!session || session.meta.status !== "running") return;
  try {
    session.pty.resize(cols, rows);
  } catch {
    // resize can race with exit
  }
}

export function killSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  try {
    session.pty.kill();
  } catch {
    // already dead
  }
  session.meta.status = "stopped";
}

export function disposeSession(id: string) {
  killSession(id);
  sessions.delete(id);
}

export function subscribeSession(
  id: string,
  onData: (chunk: string) => void,
  onExit: (code: number) => void,
): () => void {
  const session = sessions.get(id);
  if (!session) return () => {};
  session.listeners.add(onData);
  session.exitListeners.add(onExit);
  return () => {
    session.listeners.delete(onData);
    session.exitListeners.delete(onExit);
  };
}

export function getBuffer(id: string): string {
  return sessions.get(id)?.buffer ?? "";
}

/** Last N meaningful commands — feeds "Relevant Commands" in the context package. */
export function getCommandLog(id: string, limit = 20): string[] {
  const session = sessions.get(id);
  if (!session) return [];
  return session.commandLog.slice(-limit);
}

export function getTailOutput(id: string, chars = 4000): string {
  const buffer = getBuffer(id);
  return buffer.slice(Math.max(0, buffer.length - chars));
}

export function listSessionsForTask(taskId: string): TerminalMeta[] {
  return [...sessions.values()].filter((s) => s.meta.taskId === taskId).map((s) => s.meta);
}
