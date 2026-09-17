"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, type TerminalSessionView } from "@/lib/api-client";
import { Button, Modal, Panel, cn } from "@/components/ui/primitives";
import type { DangerousCommandMatch } from "@/lib/security-shared";

interface PendingApproval {
  sessionId: string;
  data: string;
  command: string;
  dangerous: DangerousCommandMatch | null;
}

/** One xterm instance bound to a real PTY over SSE. */
function TerminalView({
  session,
  visible,
  onRequireApproval,
}: {
  session: TerminalSessionView;
  visible: boolean;
  onRequireApproval: (pending: PendingApproval) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);

  const sendInput = useCallback(
    async (data: string, approved = false) => {
      try {
        const response = await fetch(`/api/terminal/${session.id}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, approved }),
        });
        const payload = (await response.json()) as {
          blocked?: boolean;
          command?: string;
          dangerous?: DangerousCommandMatch | null;
        };
        if (payload.blocked) {
          onRequireApproval({
            sessionId: session.id,
            data,
            command: payload.command ?? data,
            dangerous: payload.dangerous ?? null,
          });
        }
      } catch {
        // terminal may have exited
      }
    },
    [session.id, onRequireApproval],
  );

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12.5,
        cursorBlink: true,
        convertEol: false,
        scrollback: 5000,
        theme: {
          background: "#0b0d12",
          foreground: "#dbe1ea",
          cursor: "#7dd3fc",
          selectionBackground: "#334155",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      termRef.current = term;
      fitRef.current = fit;

      try {
        fit.fit();
      } catch {
        // container not measured yet
      }

      term.onData((data) => void sendInput(data));

      term.onResize(({ cols, rows }) => {
        void fetch(`/api/terminal/${session.id}/resize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cols, rows }),
        }).catch(() => {});
      });

      source = new EventSource(`/api/terminal/${session.id}/stream`);
      source.addEventListener("data", (event) => {
        term.write(JSON.parse((event as MessageEvent).data) as string);
      });
      source.addEventListener("exit", (event) => {
        const code = JSON.parse((event as MessageEvent).data) as string;
        term.write(`\r\n\x1b[90m[exit ${code}]\x1b[0m\r\n`);
      });
      source.onerror = () => source?.close();

      resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          // ignore
        }
      });
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      source?.close();
      resizeObserver?.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, [session.id, sendInput]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      try {
        fitRef.current?.fit();
        termRef.current?.focus();
      } catch {
        // ignore
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [visible]);

  return <div ref={containerRef} className={cn("h-full w-full", !visible && "hidden")} />;
}

export function TerminalPanel() {
  const { t } = useI18n();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const [sessions, setSessions] = useState<TerminalSessionView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [backend, setBackend] = useState<string>("");
  const [pending, setPending] = useState<PendingApproval | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    const response = await api.get<{ sessions: TerminalSessionView[]; backend: string }>(
      `/api/terminal?workspaceId=${workspace.id}`,
    );
    setSessions(response.sessions);
    setBackend(response.backend);
    setActiveId((current) => current ?? response.sessions[0]?.id ?? null);
  }, [workspace]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 4000);
    return () => clearInterval(interval);
  }, [load]);

  const createSession = useCallback(
    async (type: "shell" | "dev-server") => {
      if (!workspace) return;
      const response = await api.post<{ session: TerminalSessionView }>("/api/terminal", {
        workspaceId: workspace.id,
        type,
        title: type === "dev-server" ? t("terminal.devServer") : t("terminal.shell"),
      });
      setSessions((prev) => [...prev, response.session]);
      setActiveId(response.session.id);
    },
    [workspace, t],
  );

  const closeSession = useCallback(
    async (id: string) => {
      await api.delete(`/api/terminal/${id}`);
      setSessions((prev) => prev.filter((session) => session.id !== id));
      setActiveId((current) => (current === id ? null : current));
      void load();
    },
    [load],
  );

  const approve = useCallback(
    async (always: boolean) => {
      if (!pending) return;
      if (always) {
        await api.put("/api/security/check-command", { command: pending.command });
      }
      await fetch(`/api/terminal/${pending.sessionId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: pending.data, approved: true }),
      });
      setPending(null);
    },
    [pending],
  );

  const tabs = useMemo(
    () =>
      sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => setActiveId(session.id)}
          className={cn(
            "group flex items-center gap-2 border-r border-white/5 px-3 py-1.5 text-xs whitespace-nowrap",
            session.id === activeId ? "bg-[#0b0d12] text-slate-100" : "text-slate-500 hover:text-slate-300",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", session.status === "running" ? "bg-emerald-400" : "bg-slate-600")} />
          <span className="max-w-[160px] truncate">{session.title}</span>
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              void closeSession(session.id);
            }}
            onKeyDown={() => {}}
            className="text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-400"
          >
            ✕
          </span>
        </button>
      )),
    [sessions, activeId, closeSession],
  );

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {t("terminal.title")}
          {backend ? (
            <span className="font-normal normal-case text-[10px] text-slate-600">
              {t("terminal.backend")}: {backend}
            </span>
          ) : null}
        </span>
      }
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => void createSession("shell")} title={t("terminal.newTab")}>
            ＋ {t("terminal.shell")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void createSession("dev-server")}>
            {t("terminal.devServer")}
          </Button>
        </>
      }
      className="h-full border-t border-white/5"
      bodyClassName="flex flex-col"
    >
      {sessions.length ? (
        <>
          <div className="flex shrink-0 overflow-x-auto border-b border-white/5 bg-[#0f1219]">{tabs}</div>
          <div className="min-h-0 flex-1 bg-[#0b0d12] p-1">
            {sessions.map((session) => (
              <TerminalView
                key={session.id}
                session={session}
                visible={session.id === activeId}
                onRequireApproval={setPending}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center">
          <Button variant="subtle" onClick={() => void createSession("shell")}>
            {t("terminal.noSession")}
          </Button>
        </div>
      )}

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={t("security.dangerousTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t("common.reject")}
            </Button>
            <Button variant="subtle" onClick={() => void approve(true)}>
              {t("common.allowAlways")}
            </Button>
            <Button variant="danger" onClick={() => void approve(false)}>
              {t("common.allowOnce")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">{t("security.dangerousBody")}</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-black/40 p-3 text-xs text-amber-300">{pending?.command}</pre>
        {pending?.dangerous ? (
          <p className="mt-2 text-xs text-slate-500">{pending.dangerous.description}</p>
        ) : null}
      </Modal>
    </Panel>
  );
}
