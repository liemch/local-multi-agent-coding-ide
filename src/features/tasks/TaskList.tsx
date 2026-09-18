"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, type TaskView } from "@/lib/api-client";
import { Badge, Button, EmptyState, Panel, cn } from "@/components/ui/primitives";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  draft: "neutral",
  queued: "neutral",
  preparing: "info",
  running: "info",
  checkpointing: "warning",
  handoff: "warning",
  human_control: "warning",
  paused: "neutral",
  failed: "danger",
  completed: "success",
};

export function TaskList({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const selectedTaskId = useWorkspaceStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useWorkspaceStore((s) => s.setSelectedTaskId);
  const setCreateTaskOpen = useWorkspaceStore((s) => s.setCreateTaskOpen);
  const refreshTick = useWorkspaceStore((s) => s.refreshTick);

  const [tasks, setTasks] = useState<TaskView[]>([]);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const response = await api.get<{ tasks: TaskView[] }>(`/api/tasks?workspaceId=${workspace.id}`);
      setTasks(response.tasks);
      if (!selectedTaskId && response.tasks.length) setSelectedTaskId(response.tasks[0].id);
    } catch {
      setTasks([]);
    }
  }, [workspace, selectedTaskId, setSelectedTaskId]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  useEffect(() => {
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <Panel
      title={t("tasks.title")}
      actions={
        <Button size="sm" variant="primary" onClick={() => setCreateTaskOpen(true)}>
          ＋ {t("tasks.create")}
        </Button>
      }
      className={cn("h-full", compact && "border-r border-white/5")}
    >
      {tasks.length ? (
        <ul className="divide-y divide-white/5">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                onClick={() => setSelectedTaskId(task.id)}
                className={cn(
                  "w-full px-3 py-2 text-left hover:bg-white/5",
                  task.id === selectedTaskId && "bg-sky-500/10",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-sky-400">{task.id}</span>
                  <Badge tone={STATUS_TONE[task.status] ?? "neutral"}>{t(`tasks.status.${task.status}`)}</Badge>
                </div>
                <p className="mt-0.5 truncate text-[13px] text-slate-200">{task.title}</p>
                <p className="text-[11px] text-slate-600">
                  {task.activeAgent ?? task.preferredAgent ?? t("common.auto")} · {t(`tasks.mode${task.mode.charAt(0).toUpperCase()}${task.mode.slice(1)}`)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t("tasks.empty")}
          action={
            <Button variant="primary" size="sm" className="mt-2" onClick={() => setCreateTaskOpen(true)}>
              {t("dashboard.createFirst")}
            </Button>
          }
        />
      )}
    </Panel>
  );
}
