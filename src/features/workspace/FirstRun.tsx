"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore, type WorkspaceInfo } from "@/stores/workspace-store";
import { api, type AgentView } from "@/lib/api-client";
import { Badge, Button, Input, Spinner } from "@/components/ui/primitives";

export function FirstRun() {
  const { t, locale, setLocale } = useI18n();
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const [path, setPath] = useState("");
  const [recent, setRecent] = useState<WorkspaceInfo[]>([]);
  const [agents, setAgents] = useState<AgentView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ workspaces: WorkspaceInfo[] }>("/api/workspaces")
      .then((response) => setRecent(response.workspaces))
      .catch(() => setRecent([]));
  }, []);

  const detectAgents = useCallback(async () => {
    setAgents(null);
    const response = await api.get<{ agents: AgentView[] }>("/api/agents?refresh=1");
    setAgents(response.agents);
  }, []);

  useEffect(() => {
    void detectAgents();
  }, [detectAgents]);

  const openWorkspace = useCallback(
    async (payload: { path?: string; useSample?: boolean; id?: string }) => {
      setBusy(true);
      setError(null);
      try {
        if (payload.id) {
          const response = await api.get<{ workspace: WorkspaceInfo }>(`/api/workspaces/${payload.id}`);
          setWorkspace(response.workspace);
          return;
        }
        const response = await api.post<{ workspace: WorkspaceInfo }>("/api/workspaces", payload);
        setWorkspace(response.workspace);
      } catch (err) {
        const code = err instanceof Error ? err.message : String(err);
        const map: Record<string, string> = {
          PROTECTED_PATH: t("errors.protectedPath"),
          NOT_FOUND: t("errors.pathNotFound"),
          NOT_A_DIRECTORY: t("errors.notDirectory"),
        };
        setError(map[code] ?? code);
      } finally {
        setBusy(false);
      }
    },
    [setWorkspace, t],
  );

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold text-slate-100">{t("firstRun.welcome")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("firstRun.intro")}</p>
          <button
            className="mt-2 text-[11px] text-slate-600 underline hover:text-slate-400"
            onClick={() => setLocale(locale === "vi" ? "en" : "vi")}
          >
            {locale === "vi" ? "English" : "Tiếng Việt"}
          </button>
        </header>

        <section className="rounded-xl border border-white/10 bg-[#0f1219] p-4">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">{t("firstRun.pathLabel")}</span>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder={t("firstRun.pathPlaceholder")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && path.trim()) void openWorkspace({ path: path.trim() });
                }}
              />
              <Button variant="primary" disabled={busy || !path.trim()} onClick={() => void openWorkspace({ path: path.trim() })}>
                {t("firstRun.openProject")}
              </Button>
            </div>
          </label>

          {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="subtle" disabled={busy} onClick={() => void openWorkspace({ useSample: true })}>
              {t("firstRun.useSample")}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#0f1219] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("firstRun.checkAgents")}</h2>
            <Button size="sm" variant="ghost" onClick={() => void detectAgents()}>
              ⟳
            </Button>
          </div>
          {agents === null ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Spinner /> {t("firstRun.detecting")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {agents.map((agent) => (
                <li key={agent.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{agent.name}</span>
                  {agent.installed ? (
                    <span className="flex items-center gap-2">
                      <Badge tone="success">{t("common.installed")}</Badge>
                      {agent.version ? <span className="text-[11px] text-slate-600">{agent.version}</span> : null}
                    </span>
                  ) : (
                    <Badge tone="neutral">{t("common.notInstalled")}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {recent.length ? (
          <section className="rounded-xl border border-white/10 bg-[#0f1219] p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("firstRun.recent")}</h2>
            <ul className="space-y-1">
              {recent.map((workspace) => (
                <li key={workspace.id}>
                  <button
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-white/5"
                    onClick={() => void openWorkspace({ id: workspace.id })}
                  >
                    <span className="text-sm text-slate-200">{workspace.name}</span>
                    <span className="truncate pl-4 font-mono text-[11px] text-slate-600">{workspace.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
