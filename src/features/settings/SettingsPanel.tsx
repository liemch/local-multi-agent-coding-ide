"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useI18n, type Locale } from "@/lib/i18n";
import { api } from "@/lib/api-client";
import { Button, Input, Panel, Select, cn } from "@/components/ui/primitives";

interface SettingsShape {
  locale: string;
  routingMode: "manual" | "priority" | "smart";
  agentPriority: string[];
  warningThreshold: number;
  autoHandoff: boolean;
  preemptiveHandoff: boolean;
  simulateWhenMissing: boolean;
  permissionMode: "safe" | "balanced" | "auto";
  autoCreateBranch: boolean;
  alwaysAllowCommands: string[];
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
          checked ? "bg-sky-500" : "bg-white/10",
        )}
      >
        <span className={cn("block h-4 w-4 rounded-full bg-white transition-transform", checked && "translate-x-4")} />
      </button>
      <span>
        <span className="block text-sm text-slate-200">{label}</span>
        {hint ? <span className="block text-[11px] text-slate-600">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SettingsPanel() {
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [health, setHealth] = useState<{ database?: string; ptyBackend?: string }>({});
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [settingsResponse, healthResponse] = await Promise.all([
      api.get<{ settings: SettingsShape }>("/api/settings"),
      api.get<{ database: string; ptyBackend: string }>("/api/health"),
    ]);
    setSettings(settingsResponse.settings);
    setHealth(healthResponse);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(async (patch: Partial<SettingsShape>) => {
    const response = await api.put<{ settings: SettingsShape }>("/api/settings", patch);
    setSettings(response.settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  if (!settings) {
    return (
      <Panel title={t("settings.title")} className="h-full">
        <p className="p-4 text-sm text-slate-500">{t("common.loading")}</p>
      </Panel>
    );
  }

  const movePriority = (index: number, delta: number) => {
    const next = [...settings.agentPriority];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void update({ agentPriority: next });
  };

  const permissionHint = {
    safe: t("settings.permissionSafeHint"),
    balanced: t("settings.permissionBalancedHint"),
    auto: t("settings.permissionAutoHint"),
  }[settings.permissionMode];

  return (
    <Panel
      title={t("settings.title")}
      actions={saved ? <span className="text-[11px] text-emerald-400">{t("settings.saved")}</span> : null}
      className="h-full"
    >
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("settings.general")}</h3>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">{t("settings.language")}</span>
            <Select
              value={locale}
              onChange={(event) => {
                const next = event.target.value as Locale;
                setLocale(next);
                void update({ locale: next });
              }}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </Select>
          </label>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("settings.routing")}</h3>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">{t("settings.routingMode")}</span>
            <Select
              value={settings.routingMode}
              onChange={(event) => void update({ routingMode: event.target.value as SettingsShape["routingMode"] })}
            >
              <option value="manual">{t("settings.routingManual")}</option>
              <option value="priority">{t("settings.routingPriority")}</option>
              <option value="smart">{t("settings.routingSmart")}</option>
            </Select>
          </label>

          <div className="mt-3">
            <span className="mb-1 block text-xs text-slate-400">{t("settings.agentPriority")}</span>
            <ul className="space-y-1">
              {settings.agentPriority.map((agent, index) => (
                <li key={agent} className="flex items-center gap-2 rounded border border-white/5 px-2 py-1 text-sm">
                  <span className="w-5 text-slate-600">{index + 1}.</span>
                  <span className="flex-1 capitalize text-slate-200">{agent}</span>
                  <Button size="sm" variant="ghost" onClick={() => movePriority(index, -1)} disabled={index === 0}>
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => movePriority(index, 1)}
                    disabled={index === settings.agentPriority.length - 1}
                  >
                    ↓
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-slate-400">{t("settings.warningThreshold")}</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={settings.warningThreshold}
              onChange={(event) => setSettings({ ...settings, warningThreshold: Number(event.target.value) })}
              onBlur={(event) => void update({ warningThreshold: Number(event.target.value) })}
            />
          </label>

          <div className="mt-2">
            <Toggle
              checked={settings.autoHandoff}
              onChange={(value) => void update({ autoHandoff: value })}
              label={t("settings.autoHandoff")}
            />
            <Toggle
              checked={settings.preemptiveHandoff}
              onChange={(value) => void update({ preemptiveHandoff: value })}
              label={t("settings.preemptiveHandoff")}
            />
            <Toggle
              checked={settings.simulateWhenMissing}
              onChange={(value) => void update({ simulateWhenMissing: value })}
              label={t("settings.simulateWhenMissing")}
            />
            <Toggle
              checked={settings.autoCreateBranch}
              onChange={(value) => void update({ autoCreateBranch: value })}
              label={t("settings.autoCreateBranch")}
            />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("settings.security")}</h3>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">{t("settings.permissionMode")}</span>
            <Select
              value={settings.permissionMode}
              onChange={(event) => void update({ permissionMode: event.target.value as SettingsShape["permissionMode"] })}
            >
              <option value="safe">{t("settings.permissionSafe")}</option>
              <option value="balanced">{t("settings.permissionBalanced")}</option>
              <option value="auto">{t("settings.permissionAuto")}</option>
            </Select>
            <span className="mt-1 block text-[11px] text-slate-600">{permissionHint}</span>
          </label>

          {settings.alwaysAllowCommands.length ? (
            <div className="mt-3">
              <span className="mb-1 block text-xs text-slate-400">{t("settings.alwaysAllowed")}</span>
              <ul className="space-y-1">
                {settings.alwaysAllowCommands.map((command) => (
                  <li key={command} className="flex items-center justify-between gap-2 rounded bg-black/30 px-2 py-1">
                    <code className="text-[11px] text-amber-300">{command}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void update({
                          alwaysAllowCommands: settings.alwaysAllowCommands.filter((item) => item !== command),
                        })
                      }
                    >
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="border-t border-white/5 pt-3 text-[11px] text-slate-600">
          <p>
            {t("settings.database")}: <code>{health.database}</code>
          </p>
          <p>
            {t("settings.ptyBackend")}: <code>{health.ptyBackend}</code>
          </p>
        </section>
      </div>
    </Panel>
  );
}
