"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { api, type AgentView, type AgentUsageView } from "@/lib/api-client";
import { Badge, Button, Input, Panel, Select, cn } from "@/components/ui/primitives";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  available: "success",
  warning: "warning",
  rate_limited: "danger",
  quota_exhausted: "danger",
  exhausted: "danger",
  disabled: "neutral",
  unknown: "neutral",
};

/** Usage display — shows "Không xác định" rather than inventing a number. */
export function UsageBar({ usage }: { usage: AgentUsageView }) {
  const { t } = useI18n();
  const hasNumber = typeof usage.percentageUsed === "number";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500">{t("usage.percentage")}</span>
        <span className={cn(hasNumber ? "text-slate-200" : "text-slate-500 italic")}>
          {hasNumber ? `${usage.percentageUsed}%` : t("usage.unknown")}
        </span>
      </div>
      {hasNumber ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className={cn(
              "h-full rounded-full",
              (usage.percentageUsed ?? 0) >= 85 ? "bg-rose-400" : (usage.percentageUsed ?? 0) >= 60 ? "bg-amber-400" : "bg-emerald-400",
            )}
            style={{ width: `${Math.min(100, usage.percentageUsed ?? 0)}%` }}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 text-[10px] text-slate-600">
        {typeof usage.remaining === "number" ? (
          <span>
            {t("usage.remaining")}: {usage.remaining}
          </span>
        ) : null}
        {usage.resetAt ? (
          <span>
            {t("usage.resetAt")}: {new Date(usage.resetAt).toLocaleTimeString("vi-VN", { hour12: false })}
          </span>
        ) : null}
        <span>
          {t("usage.source")}: {t(`usage.source${usage.source.charAt(0).toUpperCase()}${usage.source.slice(1).replace(/_(.)/g, (_, c) => c.toUpperCase())}`)}
        </span>
      </div>
    </div>
  );
}

export function AgentsPanel() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAccount, setNewAccount] = useState<{ agent: string; name: string }>({ agent: "codex", name: "" });

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const response = await api.get<{ agents: AgentView[] }>(`/api/agents${refresh ? "?refresh=1" : ""}`);
      setAgents(response.agents);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 8000);
    return () => clearInterval(interval);
  }, [load]);

  const addAccount = async () => {
    if (!newAccount.name.trim()) return;
    await api.post("/api/providers/accounts", { agent: newAccount.agent, name: newAccount.name.trim() });
    setNewAccount({ agent: newAccount.agent, name: "" });
    void load();
  };

  return (
    <Panel
      title={t("agents.title")}
      actions={
        <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load(true)}>
          ⟳ {t("agents.detect")}
        </Button>
      }
      className="h-full"
    >
      <div className="space-y-3 p-3">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-lg border border-white/5 bg-[#0b0d12] p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">{agent.name}</h3>
                  {agent.installed ? (
                    <Badge tone="success">{t("common.installed")}</Badge>
                  ) : (
                    <Badge tone="neutral">{t("common.notInstalled")}</Badge>
                  )}
                  <Badge tone={STATUS_TONE[agent.usage.status] ?? "neutral"}>
                    {t(`usage.status.${agent.usage.status}`)}
                  </Badge>
                </div>
                {agent.version ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {t("common.version")}: {agent.version}
                  </p>
                ) : null}
                {agent.binaryPath ? (
                  <p className="font-mono text-[10px] text-slate-600">{agent.binaryPath}</p>
                ) : (
                  <p className="text-[11px] text-slate-600">{t("agents.notInstalledHint")}</p>
                )}
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <p>
                  {t("agents.runningTasks")}: {agent.runningTasks}
                </p>
              </div>
            </div>

            <div className="mt-2">
              <UsageBar usage={agent.usage} />
            </div>

            <div className="mt-3 border-t border-white/5 pt-2">
              <p className="mb-1.5 text-[11px] font-medium text-slate-500">{t("agents.accounts")}</p>
              <ul className="space-y-1">
                {agent.accounts.map((account) => (
                  <li key={account.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="text-slate-300">{account.name}</span>
                      <Badge tone={STATUS_TONE[account.status] ?? "neutral"}>
                        {t(`usage.status.${account.status}`)}
                      </Badge>
                      {typeof account.percentageUsed === "number" ? (
                        <span className="text-slate-500">{account.percentageUsed}%</span>
                      ) : (
                        <span className="italic text-slate-600">{t("usage.unknown")}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await api.patch("/api/providers/accounts", { id: account.id, enabled: !account.enabled });
                          void load();
                        }}
                      >
                        {account.enabled ? t("agents.disable") : t("agents.enable")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await api.delete(`/api/providers/accounts?id=${account.id}`);
                          void load();
                        }}
                      >
                        ✕
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}

        <div className="rounded-lg border border-dashed border-white/10 p-3">
          <p className="mb-2 text-[11px] font-medium text-slate-500">{t("agents.addAccount")}</p>
          <div className="flex gap-2">
            <Select
              className="w-40"
              value={newAccount.agent}
              onChange={(event) => setNewAccount((prev) => ({ ...prev, agent: event.target.value }))}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="antigravity">Antigravity</option>
            </Select>
            <Input
              placeholder={t("agents.accountName")}
              value={newAccount.name}
              onChange={(event) => setNewAccount((prev) => ({ ...prev, name: event.target.value }))}
            />
            <Button variant="primary" onClick={() => void addAccount()} disabled={!newAccount.name.trim()}>
              {t("common.add")}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
