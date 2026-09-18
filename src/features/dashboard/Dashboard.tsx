"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, type AgentUsageView, type TaskView, type TimelineEntry } from "@/lib/api-client";
import { Badge, Button, EmptyState, Panel } from "@/components/ui/primitives";
import { UsageBar } from "@/features/agents/AgentsPanel";

interface DashboardData {
  tasks: TaskView[];
  runningTasks: TaskView[];
  recentActivity: TimelineEntry[];
  git: { branch: string | null; dirty: boolean; changedFiles: number } | null;
  agents: Array<{
    id: string;
    installed: boolean;
    version: string | null;
    usage: AgentUsageView;
    running: number;
  }>;
  testResult: string | null;
}

export function Dashboard() {
  const { t } = useI18n();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setSelectedTaskId = useWorkspaceStore((s) => s.setSelectedTaskId);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setCreateTaskOpen = useWorkspaceStore((s) => s.setCreateTaskOpen);
  const refreshTick = useWorkspaceStore((s) => s.refreshTick);

  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      setData(await api.get<DashboardData>(`/api/workspaces/${workspace.id}/dashboard`));
    } catch {
      setData(null);
    }
  }, [workspace]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [load, refreshTick]);

  if (!data) {
    return (
      <Panel className="h-full">
        <p className="p-4 text-sm text-slate-500">{t("common.loading")}</p>
      </Panel>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
        <Panel title={t("dashboard.runningTasks")} className="rounded-lg border border-white/5">
          {data.runningTasks.length ? (
            <ul className="divide-y divide-white/5">
              {data.runningTasks.map((task) => (
                <li key={task.id}>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-white/5"
                    onClick={() => {
                      setSelectedTaskId(task.id);
                      setActiveTab("tasks");
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-sky-400">{task.id}</span>
                      <Badge tone="info">{t(`tasks.status.${task.status}`)}</Badge>
                    </div>
                    <p className="text-sm text-slate-200">{task.title}</p>
                    <p className="text-[11px] text-slate-600">{task.activeAgent ?? t("common.auto")}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={t("dashboard.noRunning")}
              action={
                <Button size="sm" variant="primary" className="mt-2" onClick={() => setCreateTaskOpen(true)}>
                  {t("dashboard.createFirst")}
                </Button>
              }
            />
          )}
        </Panel>

        <Panel title={t("dashboard.agents")} className="rounded-lg border border-white/5">
          <ul className="divide-y divide-white/5">
            {data.agents.map((agent) => (
              <li key={agent.id} className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm capitalize text-slate-200">{agent.id}</span>
                  {agent.installed ? (
                    <Badge tone={agent.running > 0 ? "info" : "success"}>
                      {agent.running > 0 ? t("common.running") : t("common.available")}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{t("common.notInstalled")}</Badge>
                  )}
                </div>
                <div className="mt-1">
                  <UsageBar usage={agent.usage} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("dashboard.workspace")} className="rounded-lg border border-white/5">
          <dl className="space-y-2 p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t("git.branch")}</dt>
              <dd className="font-mono text-sky-300">{data.git?.branch ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t("workspace.changedFiles")}</dt>
              <dd className="text-slate-200">{data.git?.changedFiles ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">{t("dashboard.test")}</dt>
              <dd className="truncate text-right text-xs text-slate-300" title={data.testResult ?? ""}>
                {data.testResult ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t("common.path")}</dt>
              <dd className="truncate text-right font-mono text-[11px] text-slate-500">{workspace?.path}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title={t("dashboard.recentActivity")} className="rounded-lg border border-white/5">
          {data.recentActivity.length ? (
            <ul className="space-y-1.5 p-3 text-xs">
              {data.recentActivity.map((entry) => (
                <li key={entry.id} className="flex gap-2">
                  <span className="shrink-0 font-mono text-slate-600">
                    {new Date(entry.createdAt).toLocaleTimeString("vi-VN", { hour12: false }).slice(0, 5)}
                  </span>
                  <span className="text-slate-300">{entry.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("dashboard.noActivity")} />
          )}
        </Panel>
      </div>
    </div>
  );
}
