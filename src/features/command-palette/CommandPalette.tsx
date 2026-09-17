"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/lib/api-client";
import { cn } from "@/components/ui/primitives";

interface Command {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

/** Command palette — Ctrl+Shift+P (plan §47). */
export function CommandPalette() {
  const { t } = useI18n();
  const open = useWorkspaceStore((s) => s.commandPaletteOpen);
  const setOpen = useWorkspaceStore((s) => s.setCommandPaletteOpen);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setCreateTaskOpen = useWorkspaceStore((s) => s.setCreateTaskOpen);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const selectedTaskId = useWorkspaceStore((s) => s.selectedTaskId);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const bumpRefresh = useWorkspaceStore((s) => s.bumpRefresh);
  const setTerminalVisible = useWorkspaceStore((s) => s.setTerminalVisible);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  const taskAction = async (path: string, body?: unknown) => {
    if (!selectedTaskId) return;
    await api.post(`/api/tasks/${selectedTaskId}/${path}`, body);
    bumpRefresh();
  };

  const commands: Command[] = useMemo(
    () => [
      { id: "openProject", label: t("commandPalette.openProject"), run: () => setWorkspace(null) },
      { id: "createTask", label: t("commandPalette.createTask"), run: () => setCreateTaskOpen(true) },
      {
        id: "openTerminal",
        label: t("commandPalette.openTerminal"),
        run: async () => {
          setActiveTab("ide");
          setTerminalVisible(true);
          if (workspace) await api.post("/api/terminal", { workspaceId: workspace.id, type: "shell" });
          bumpRefresh();
        },
      },
      { id: "runWithCodex", label: t("commandPalette.runWithCodex"), run: () => taskAction("switch-agent", { agent: "codex" }) },
      { id: "runWithClaude", label: t("commandPalette.runWithClaude"), run: () => taskAction("switch-agent", { agent: "claude" }) },
      {
        id: "runWithAntigravity",
        label: t("commandPalette.runWithAntigravity"),
        run: () => taskAction("switch-agent", { agent: "antigravity" }),
      },
      { id: "autoSelectAgent", label: t("commandPalette.autoSelectAgent"), run: () => taskAction("resume", { agent: "auto" }) },
      { id: "pauseAgent", label: t("commandPalette.pauseAgent"), run: () => taskAction("pause") },
      { id: "resumeAgent", label: t("commandPalette.resumeAgent"), run: () => taskAction("resume") },
      { id: "takeOver", label: t("commandPalette.takeOver"), run: () => taskAction("takeover") },
      { id: "createCheckpoint", label: t("commandPalette.createCheckpoint"), run: () => taskAction("checkpoint") },
      { id: "viewGitStatus", label: t("commandPalette.viewGitStatus"), run: () => setActiveTab("git") },
      { id: "viewDiff", label: t("commandPalette.viewDiff"), run: () => setActiveTab("git") },
      { id: "openSettings", label: t("commandPalette.openSettings"), run: () => setActiveTab("settings") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, workspace, selectedTaskId],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(needle));
  }, [commands, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#111520] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((value) => Math.min(value + 1, filtered.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const command = filtered[cursor];
              if (command) {
                void command.run();
                setOpen(false);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={t("commandPalette.placeholder")}
          className="w-full border-b border-white/5 bg-transparent px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
        />
        <ul className="max-h-80 overflow-auto py-1">
          {filtered.map((command, index) => (
            <li key={command.id}>
              <button
                onMouseEnter={() => setCursor(index)}
                onClick={() => {
                  void command.run();
                  setOpen(false);
                }}
                className={cn("w-full px-4 py-2 text-left text-sm", index === cursor ? "bg-sky-500/15 text-sky-100" : "text-slate-300")}
              >
                {command.label}
              </button>
            </li>
          ))}
          {!filtered.length ? <li className="px-4 py-3 text-sm text-slate-600">{t("commandPalette.noResults")}</li> : null}
        </ul>
      </div>
    </div>
  );
}
