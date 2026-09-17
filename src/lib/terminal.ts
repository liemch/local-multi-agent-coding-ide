import { randomUUID } from "node:crypto";

type IPty = {
  pid: number;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
};

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
  createdAt: number;
}

interface Session {
  meta: TerminalMeta;
  pty: IPty;
  buffer: string;
  listeners: Set<(chunk: string) => void>;
  exitListeners: Set<(code: number) => void>;
}

const MAX_BUFFER = 200_000;

const globalStore = globalThis as typeof globalThis & {
  __ideTerminalSessions?: Map<string, Session>;
};

const sessions: Map<string, Session> = globalStore.__ideTerminalSessions ?? new Map();
globalStore.__ideTerminalSessions = sessions;

function loadPty(): {
  spawn: (file: string, args: string[], opts: Record<string, unknown>) => IPty;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node-pty");
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
}): TerminalMeta {
  const pty = loadPty();
  const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash";
  const file = opts.command ?? shell;
  const args = opts.args ?? [];

  const ptyProcess = pty.spawn(file, args, {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...opts.env,
      TERM: "xterm-256color",
      FORCE_COLOR: "1",
    } as Record<string, string>,
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
    pid: ptyProcess.pid,
    createdAt: Date.now(),
  };

  const session: Session = {
    meta,
    pty: ptyProcess,
    buffer: "",
    listeners: new Set(),
    exitListeners: new Set(),
  };

  ptyProcess.onData((data: string) => {
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER);
    }
    for (const l of session.listeners) l(data);
  });

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    session.meta.status = "exited";
    session.meta.exitCode = exitCode;
    for (const l of session.exitListeners) l(exitCode);
  });

  sessions.set(id, session);
  return meta;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function listSessions(workspaceId?: string): TerminalMeta[] {
  return [...sessions.values()]
    .filter((s) => !workspaceId || s.meta.workspaceId === workspaceId)
    .map((s) => s.meta);
}

export function writeToSession(id: string, data: string) {
  const s = sessions.get(id);
  if (!s || s.meta.status !== "running") return;
  s.pty.write(data);
}

export function resizeSession(id: string, cols: number, rows: number) {
  const s = sessions.get(id);
  if (!s || s.meta.status !== "running") return;
  try {
    s.pty.resize(cols, rows);
  } catch {
    // ignore resize race
  }
}

export function killSession(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    s.pty.kill();
  } catch {
    // already dead
  }
  s.meta.status = "stopped";
}

export function subscribeSession(id: string, onData: (chunk: string) => void, onExit: (code: number) => void) {
  const s = sessions.get(id);
  if (!s) return () => {};
  s.listeners.add(onData);
  s.exitListeners.add(onExit);
  return () => {
    s.listeners.delete(onData);
    s.exitListeners.delete(onExit);
  };
}

export function getBuffer(id: string): string {
  return sessions.get(id)?.buffer ?? "";
}
