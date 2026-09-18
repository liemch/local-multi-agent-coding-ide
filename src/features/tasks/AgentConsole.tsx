"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  api,
  type AgentEventView,
  type CheckpointView,
  type TaskView,
  type TimelineEntry,
} from "@/lib/api-client";
import { Badge, Button, EmptyState, Panel, Select, cn } from "@/components/ui/primitives";

interface TaskDetail {
  task: TaskView;
  timeline: TimelineEntry[];
  checkpoints: CheckpointView[];
  context: {
    progress: string;
    todo: string;
    decisions: string;
    filesTouched: string[];
    gitState: { branch: string | null; head: string | null; dirty: boolean };
    testResult: string | null;
  } | null;
  runtime: { agent: string; simulated: boolean } | null;
}

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

const EVENT_TONE: Record<string, string> = {
  provider_error: "text-rose-300",
  error: "text-rose-300",
  task_error: "text-amber-300",
  routing: "text-sky-300",
  checkpoint: "text-violet-300",
  handoff_complete: "text-emerald-300",
  task_completed: "text-emerald-300",
  test_pass: "text-emerald-300",
  test_fail: "text-rose-300",
  file_change: "text-cyan-300",
  usage: "text-amber-200",
  agent_started: "text-sky-300",
  human_control: "text-amber-300",
};

function formatElapsed(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} phút ${seconds % 60} giây` : `${seconds} giây`;
}

export function AgentConsole() {
  const { t } = useI18n();
  const selectedTaskId = useWorkspaceStore((s) => s.selectedTaskId);
  const bumpRefresh = useWorkspaceStore((s) => s.bumpRefresh);

  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [events, setEvents] = useState<AgentEventView[]>([]);
  const [busy, setBusy] = useState(false);
  const [handAgent, setHandAgent] = useState("auto");
  const [tab, setTab] = useState<"activity" | "timeline" | "context" | "checkpoints">("activity");
  const [tick, setTick] = useState(0);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!selectedTaskId) {
      setDetail(null);
      return;
    }
    try {
      const response = await api.get<TaskDetail>(`/api/tasks/${selectedTaskId}`);
      setDetail(response);
    } catch {
      setDetail(null);
    }
  }, [selectedTaskId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live clock for the elapsed timer.
  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Realtime agent events (plan §39).
  useEffect(() => {
    if (!selectedTaskId) {
      setEvents([]);
      return;
    }
    setEvents([]);
    const source = new EventSource(`/api/tasks/${selectedTaskId}/events`);

    source.addEventListener("agent", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as AgentEventView;
      setEvents((prev) => [...prev.slice(-300), payload]);
      if (["task_status", "checkpoint", "handoff_complete", "task_completed", "routing"].includes(payload.type)) {
        void load();
        bumpRefresh();
      }
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [selectedTaskId, load, bumpRefresh]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [events]);

  const act = useCallback(
    async (path: string, body?: unknown) => {
      if (!selectedTaskId) return;
      setBusy(true);
      try {
        await api.post(`/api/tasks/${selectedTaskId}/${path}`, body);
        await load();
        bumpRefresh();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [selectedTaskId, load, bumpRefresh],
  );

  const restoreCheckpoint = useCallback(
    async (checkpointId: string, name: string) => {
      if (!selectedTaskId) return;
      await api.put(`/api/tasks/${selectedTaskId}/checkpoint`, { checkpointId });
      window.alert(t("console.restored", { name }));
      await load();
    },
    [selectedTaskId, load, t],
  );

  const status = detail?.task.status ?? "draft";
  const isActive = ["running", "preparing", "checkpointing", "handoff"].includes(status);

  const elapsed = useMemo(
    () => (detail ? formatElapsed(detail.task.startedAt, detail.task.completedAt) : "—"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, tick],
  );

  if (!selectedTaskId || !detail) {
    return (
      <Panel title={t("console.title")} className="h-full border-l border-white/5">
        <EmptyState title={t("console.noTask")} hint={t("console.noTaskHint")} />
      </Panel>
    );
  }

  const { task, context } = detail;

  return (
    <Panel
      title={t("console.title")}
      className="h-full border-l border-white/5"
      bodyClassName="flex flex-col"
      actions={<Badge tone={STATUS_TONE[status] ?? "neutral"}>{t(`tasks.status.${status}`)}</Badge>}
    >
      <div className="shrink-0 space-y-2 border-b border-white/5 p-3">
        <div>
          <p className="font-mono text-xs text-sky-400">{task.id}</p>
          <h3 className="text-sm font-semibold text-slate-100">{task.title}</h3>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex justify-between">
            <dt className="text-slate-500">{t("console.agent")}</dt>
            <dd className="text-slate-200">{task.activeAgent ?? t("common.auto")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">{t("console.elapsed")}</dt>
            <dd className="text-slate-200">{elapsed}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">{t("console.changedFiles")}</dt>
            <dd className="text-slate-200">{context?.filesTouched.length ?? 0}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">HEAD</dt>
            <dd className="font-mono text-slate-200">{context?.gitState.head ?? "—"}</dd>
          </div>
        </dl>

        {detail.runtime?.simulated ? (
          <p className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">{t("console.simulated")}</p>
        ) : null}

        {status === "human_control" ? (
          <p className="rounded bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">{t("console.humanControl")}</p>
        ) : null}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {["draft", "queued", "paused"].includes(status) ? (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void act(status === "paused" ? "resume" : "start")}>
              {status === "paused" ? t("common.resume") : t("common.start")}
            </Button>
          ) : null}

          {isActive ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => void act("pause")}>
                {t("common.pause")}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void act("takeover")}>
                {t("common.takeOver")}
              </Button>
            </>
          ) : null}

          <Button size="sm" disabled={busy} onClick={() => void act("checkpoint")}>
            {t("console.createCheckpoint")}
          </Button>

          {isActive || status === "paused" ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void act("stop")}>
              {t("common.stop")}
            </Button>
          ) : null}
        </div>

        {/* Human → Agent handback (plan §38) */}
        {["human_control", "paused"].includes(status) ? (
          <div className="flex items-center gap-1.5 pt-1">
            <Select value={handAgent} onChange={(event) => setHandAgent(event.target.value)} className="h-7 py-0 text-xs">
              <option value="auto">{t("commandPalette.autoSelectAgent")}</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="antigravity">Antigravity</option>
            </Select>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void act("handback", { agent: handAgent })}>
              {t("common.handBack")}
            </Button>
          </div>
        ) : null}

        {isActive ? (
          <div className="flex items-center gap-1.5">
            <Select
              className="h-7 py-0 text-xs"
              value=""
              onChange={(event) => {
                if (event.target.value) void act("switch-agent", { agent: event.target.value });
              }}
            >
              <option value="">{t("common.switchAgent")}…</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="antigravity">Antigravity</option>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              title={t("console.simulateFailure")}
              onClick={() => void act("simulate", { reason: "quota_exhausted" })}
            >
              ⚡ {t("console.simulateFailure")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-px border-b border-white/5 bg-[#0b0d12] text-[11px]">
        {(["activity", "timeline", "context", "checkpoints"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn("px-3 py-1.5", tab === key ? "bg-[#0f1219] text-slate-100" : "text-slate-500 hover:text-slate-300")}
          >
            {t(`console.${key}`)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto" ref={feedRef}>
        {tab === "activity" ? (
          events.length ? (
            <ul className="space-y-0.5 p-2 font-mono text-[11px] leading-relaxed">
              {events.map((event, index) => (
                <li key={index} className={cn("flex gap-2", EVENT_TONE[event.type] ?? "text-slate-400")}>
                  <span className="shrink-0 text-slate-600">
                    {new Date(event.createdAt).toLocaleTimeString("vi-VN", { hour12: false })}
                  </span>
                  <span className="break-words">{event.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("console.noEvents")} />
          )
        ) : null}

        {tab === "timeline" ? (
          <ul className="space-y-2 p-3 text-xs">
            {detail.timeline.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 font-mono text-slate-600">
                  {new Date(entry.createdAt).toLocaleTimeString("vi-VN", { hour12: false }).slice(0, 5)}
                </span>
                <div>
                  <p className="text-slate-200">{entry.label}</p>
                  {entry.detail ? <p className="text-slate-600">{entry.detail}</p> : null}
                </div>
              </li>
            ))}
            {!detail.timeline.length ? <EmptyState title={t("console.noEvents")} /> : null}
          </ul>
        ) : null}

        {tab === "context" && context ? (
          <div className="space-y-3 p-3 text-xs">
            <section>
              <h4 className="mb-1 font-semibold text-slate-400">{t("console.progress")}</h4>
              <pre className="whitespace-pre-wrap break-words text-slate-300">{context.progress || "—"}</pre>
            </section>
            <section>
              <h4 className="mb-1 font-semibold text-slate-400">{t("console.todo")}</h4>
              <pre className="whitespace-pre-wrap break-words text-slate-300">{context.todo || "—"}</pre>
            </section>
            <section>
              <h4 className="mb-1 font-semibold text-slate-400">{t("console.decisions")}</h4>
              <pre className="whitespace-pre-wrap break-words text-slate-300">{context.decisions || "—"}</pre>
            </section>
            <section>
              <h4 className="mb-1 font-semibold text-slate-400">{t("dashboard.test")}</h4>
              <pre className="whitespace-pre-wrap break-words text-slate-300">{context.testResult ?? "—"}</pre>
            </section>
            <section>
              <h4 className="mb-1 font-semibold text-slate-400">{t("console.changedFiles")}</h4>
              <ul className="space-y-0.5 font-mono text-slate-300">
                {context.filesTouched.map((file) => (
                  <li key={file}>{file}</li>
                ))}
                {!context.filesTouched.length ? <li className="text-slate-600">—</li> : null}
              </ul>
            </section>
          </div>
        ) : null}

        {tab === "checkpoints" ? (
          <ul className="divide-y divide-white/5 text-xs">
            {detail.checkpoints.map((checkpoint) => (
              <li key={checkpoint.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-mono text-slate-200">{checkpoint.name}</p>
                  <p className="truncate text-[11px] text-slate-600">
                    {checkpoint.reason} · {new Date(checkpoint.createdAt).toLocaleString("vi-VN")}
                    {checkpoint.gitHead ? ` · ${checkpoint.gitHead}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void restoreCheckpoint(checkpoint.id, checkpoint.name)}>
                  {t("console.restoreCheckpoint")}
                </Button>
              </li>
            ))}
            {!detail.checkpoints.length ? <EmptyState title={t("common.empty")} /> : null}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}
