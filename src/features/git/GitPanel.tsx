"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, type GitFileStatus } from "@/lib/api-client";
import { Badge, Button, EmptyState, Input, Panel, cn } from "@/components/ui/primitives";

interface StatusResponse {
  isRepo: boolean;
  branch?: string | null;
  dirty?: boolean;
  files?: GitFileStatus[];
}

interface LogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

const CODE_LABEL: Record<string, string> = {
  M: "git.modified",
  A: "git.added",
  D: "git.deleted",
  R: "git.renamed",
  "?": "git.untracked",
  U: "git.conflict",
};

const CODE_TONE: Record<string, string> = {
  M: "text-amber-400",
  A: "text-emerald-400",
  D: "text-rose-400",
  R: "text-sky-400",
  "?": "text-slate-500",
  U: "text-fuchsia-400",
};

function DiffView({ diff }: { diff: string }) {
  if (!diff.trim()) return <EmptyState title="—" />;
  return (
    <pre className="overflow-auto p-3 font-mono text-[11px] leading-relaxed">
      {diff.split("\n").map((line, index) => (
        <div
          key={index}
          className={cn(
            line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-500/10 text-emerald-300",
            line.startsWith("-") && !line.startsWith("---") && "bg-rose-500/10 text-rose-300",
            line.startsWith("@@") && "text-sky-400",
            line.startsWith("diff ") && "text-slate-500",
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

export function GitPanel() {
  const { t } = useI18n();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const refreshTick = useWorkspaceStore((s) => s.refreshTick);
  const bumpRefresh = useWorkspaceStore((s) => s.bumpRefresh);

  const [status, setStatus] = useState<StatusResponse>({ isRepo: false });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [statusResponse, logResponse] = await Promise.all([
        api.get<StatusResponse>(`/api/git/status?workspaceId=${workspace.id}`),
        api.get<{ log: LogEntry[] }>(`/api/git/log?workspaceId=${workspace.id}`),
      ]);
      setStatus(statusResponse);
      setLog(logResponse.log ?? []);
    } catch {
      setStatus({ isRepo: false });
    }
  }, [workspace]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  useEffect(() => {
    if (!workspace || !selectedFile) {
      setDiff("");
      return;
    }
    void api
      .get<{ diff: string }>(`/api/git/diff?workspaceId=${workspace.id}&path=${encodeURIComponent(selectedFile)}`)
      .then((response) => setDiff(response.diff))
      .catch(() => setDiff(""));
  }, [workspace, selectedFile, refreshTick]);

  const commit = async () => {
    if (!workspace || !message.trim()) return;
    setBusy(true);
    try {
      const response = await api.post<{ ok: boolean; output: string }>("/api/git/commit", {
        workspaceId: workspace.id,
        message: message.trim(),
      });
      if (response.ok) {
        setMessage("");
        bumpRefresh();
        await load();
      } else {
        window.alert(response.output);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!status.isRepo) {
    return (
      <Panel title={t("git.title")} className="h-full">
        <EmptyState title={t("git.notRepo")} />
      </Panel>
    );
  }

  return (
    <div className="grid h-full grid-cols-[320px_1fr]">
      <Panel
        title={t("git.title")}
        actions={<Button size="sm" variant="ghost" onClick={() => void load()}>⟳</Button>}
        className="border-r border-white/5"
      >
        <div className="border-b border-white/5 p-3">
          <p className="text-[11px] text-slate-500">{t("git.branch")}</p>
          <p className="font-mono text-sm text-sky-300">{status.branch ?? "—"}</p>
        </div>

        <div className="border-b border-white/5 p-3">
          <p className="mb-1.5 text-[11px] text-slate-500">
            {t("git.changes")} ({status.files?.length ?? 0})
          </p>
          {status.files?.length ? (
            <ul className="space-y-0.5">
              {status.files.map((file) => (
                <li key={file.path}>
                  <button
                    onClick={() => setSelectedFile(file.path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-white/5",
                      selectedFile === file.path && "bg-sky-500/10",
                    )}
                    title={t(CODE_LABEL[file.code] ?? "git.modified")}
                  >
                    <span className={cn("w-3 font-bold", CODE_TONE[file.code])}>{file.code}</span>
                    <span className="truncate text-slate-300">{file.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-600">{t("git.noChanges")}</p>
          )}
        </div>

        <div className="space-y-2 border-b border-white/5 p-3">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("git.commitPlaceholder")}
          />
          <Button
            size="sm"
            variant="primary"
            className="w-full"
            disabled={busy || !message.trim() || !status.files?.length}
            onClick={() => void commit()}
          >
            {t("git.commit")}
          </Button>
        </div>

        <div className="p-3">
          <p className="mb-1.5 text-[11px] text-slate-500">{t("git.history")}</p>
          <ul className="space-y-1.5">
            {log.map((entry) => (
              <li key={entry.hash} className="text-[11px]">
                <span className="font-mono text-amber-400">{entry.hash}</span>{" "}
                <span className="text-slate-300">{entry.message}</span>
                <p className="text-slate-600">
                  {entry.author} · {new Date(entry.date).toLocaleString("vi-VN")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            {t("git.diff")}
            {selectedFile ? <Badge tone="info">{selectedFile}</Badge> : null}
          </span>
        }
      >
        {selectedFile ? <DiffView diff={diff} /> : <EmptyState title={t("git.selectFile")} />}
      </Panel>
    </div>
  );
}
