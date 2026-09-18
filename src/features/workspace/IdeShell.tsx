"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore, type MainTab } from "@/stores/workspace-store";
import { api, type AgentView } from "@/lib/api-client";
import { Badge, Button, Modal, cn } from "@/components/ui/primitives";
import { FileExplorer } from "@/features/explorer/FileExplorer";
import { CodeEditor } from "@/features/editor/CodeEditor";
import { TerminalPanel } from "@/features/terminal/TerminalPanel";
import { AgentConsole } from "@/features/tasks/AgentConsole";
import { TaskList } from "@/features/tasks/TaskList";
import { CreateTaskModal } from "@/features/tasks/CreateTaskModal";
import { GitPanel } from "@/features/git/GitPanel";
import { AgentsPanel } from "@/features/agents/AgentsPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { CommandPalette } from "@/features/command-palette/CommandPalette";

const TABS: MainTab[] = ["dashboard", "ide", "tasks", "git", "agents", "settings"];

function TopBar() {
  const { t } = useI18n();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setCommandPaletteOpen = useWorkspaceStore((s) => s.setCommandPaletteOpen);
  const refreshTick = useWorkspaceStore((s) => s.refreshTick);

  const [agents, setAgents] = useState<AgentView[]>([]);

  useEffect(() => {
    const load = () =>
      api
        .get<{ agents: AgentView[] }>("/api/agents")
        .then((response) => setAgents(response.agents))
        .catch(() => {});
    void load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [refreshTick]);

  const activeAgent = agents.find((agent) => agent.runningTasks > 0);
  const usageLabel = activeAgent
    ? typeof activeAgent.usage.percentageUsed === "number"
      ? `${activeAgent.name} ${activeAgent.usage.percentageUsed}%`
      : `${activeAgent.name} · ${t("usage.unknown")}`
    : t("usage.unknown");

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-white/5 bg-[#0f1219] px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-600">{t("workspace.project")}</span>
        <span className="text-sm font-semibold text-slate-100">{workspace?.name}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-600">{t("workspace.branch")}</span>
        <span className="font-mono text-xs text-sky-300">{workspace?.branch ?? "—"}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-600">{t("workspace.usage")}</span>
        <span className="text-xs text-slate-300">{usageLabel}</span>
      </div>

      <nav className="ml-auto flex items-center gap-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded px-2.5 py-1 text-xs transition-colors",
              activeTab === tab ? "bg-sky-500/15 text-sky-200" : "text-slate-400 hover:bg-white/5",
            )}
          >
            {t(`nav.${tab}`)}
          </button>
        ))}
        <Button size="sm" variant="ghost" title="Ctrl+Shift+P" onClick={() => setCommandPaletteOpen(true)}>
          ⌘
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setWorkspace(null)}>
          {t("workspace.close")}
        </Button>
      </nav>
    </header>
  );
}

/** Editor + explorer + agent console + terminal (the main IDE layout, plan §9). */
function IdeLayout() {
  const { t } = useI18n();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const terminalVisible = useWorkspaceStore((s) => s.terminalVisible);
  const toggleTerminal = useWorkspaceStore((s) => s.toggleTerminal);

  const [sensitivePrompt, setSensitivePrompt] = useState<string | null>(null);

  const doOpen = useCallback(
    async (path: string, confirmed = false) => {
      if (!workspace) return;
      const existing = useWorkspaceStore.getState().openFiles.find((file) => file.path === path);
      if (existing) {
        setActiveFile(path);
        return;
      }
      try {
        const response = await api.get<{
          content: string | null;
          mtimeMs: number;
          sensitive?: boolean;
          requiresConfirmation?: boolean;
        }>(`/api/fs/file?workspaceId=${workspace.id}&path=${encodeURIComponent(path)}${confirmed ? "&confirmed=1" : ""}`);

        if (response.requiresConfirmation) {
          setSensitivePrompt(path);
          return;
        }
        openFile({
          path,
          content: response.content ?? "",
          originalContent: response.content ?? "",
          mtimeMs: response.mtimeMs,
          dirty: false,
          externallyChanged: false,
        });
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
      }
    },
    [workspace, openFile, setActiveFile],
  );

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_340px]">
        <FileExplorer onOpenFile={(path) => void doOpen(path)} />
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <CodeEditor />
          </div>
          <div className={cn("shrink-0", terminalVisible ? "h-[38%]" : "h-auto")}>
            {terminalVisible ? (
              <TerminalPanel />
            ) : (
              <button
                onClick={toggleTerminal}
                className="w-full border-t border-white/5 bg-[#0f1219] px-3 py-1.5 text-left text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300"
              >
                {t("terminal.title")}
              </button>
            )}
          </div>
        </div>
        <AgentConsole />
      </div>

      <Modal
        open={Boolean(sensitivePrompt)}
        onClose={() => setSensitivePrompt(null)}
        title={t("editor.sensitiveTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSensitivePrompt(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const path = sensitivePrompt;
                setSensitivePrompt(null);
                if (path) void doOpen(path, true);
              }}
            >
              {t("editor.openAnyway")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          {t("editor.sensitiveBody", { name: sensitivePrompt?.split("/").pop() ?? "" })}
        </p>
      </Modal>
    </>
  );
}

export function IdeShell() {
  const activeTab = useWorkspaceStore((s) => s.activeTab);

  return (
    <div className="flex h-screen flex-col bg-[#0b0d12] text-slate-100">
      <TopBar />

      <main className="flex min-h-0 flex-1 flex-col">
        {activeTab === "dashboard" ? <Dashboard /> : null}
        {activeTab === "ide" ? <IdeLayout /> : null}
        {activeTab === "tasks" ? (
          <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr]">
            <TaskList compact />
            <AgentConsole />
          </div>
        ) : null}
        {activeTab === "git" ? <GitPanel /> : null}
        {activeTab === "agents" ? <AgentsPanel /> : null}
        {activeTab === "settings" ? <SettingsPanel /> : null}
      </main>

      <CreateTaskModal />
      <CommandPalette />
    </div>
  );
}
