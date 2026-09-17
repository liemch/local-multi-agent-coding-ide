"use client";

import React, { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, type TaskView } from "@/lib/api-client";
import { Button, Input, Modal, Select, Textarea } from "@/components/ui/primitives";

export function CreateTaskModal() {
  const { t } = useI18n();
  const open = useWorkspaceStore((s) => s.createTaskOpen);
  const setOpen = useWorkspaceStore((s) => s.setCreateTaskOpen);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setSelectedTaskId = useWorkspaceStore((s) => s.setSelectedTaskId);
  const bumpRefresh = useWorkspaceStore((s) => s.bumpRefresh);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agent, setAgent] = useState("auto");
  const [mode, setMode] = useState("implement");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setAgent("auto");
    setMode("implement");
    setPriority("normal");
  };

  const submit = async (start: boolean) => {
    if (!workspace || !title.trim()) return;
    setBusy(true);
    try {
      const response = await api.post<{ task: TaskView }>("/api/tasks", {
        workspaceId: workspace.id,
        title: title.trim(),
        description: description.trim(),
        mode,
        priority,
        preferredAgent: agent,
        start,
      });
      setSelectedTaskId(response.task.id);
      bumpRefresh();
      reset();
      setOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t("tasks.create")}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="subtle" disabled={busy || !title.trim()} onClick={() => void submit(false)}>
            {t("common.saveDraft")}
          </Button>
          <Button variant="primary" disabled={busy || !title.trim()} onClick={() => void submit(true)}>
            {t("common.start")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">{t("tasks.name")}</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("tasks.namePlaceholder")} autoFocus />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">{t("tasks.description")}</span>
          <Textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("tasks.descriptionPlaceholder")}
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">{t("tasks.agent")}</span>
            <Select value={agent} onChange={(event) => setAgent(event.target.value)}>
              <option value="auto">{t("common.auto")}</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="antigravity">Antigravity</option>
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">{t("tasks.mode")}</span>
            <Select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="plan">{t("tasks.modePlan")}</option>
              <option value="implement">{t("tasks.modeImplement")}</option>
              <option value="fix">{t("tasks.modeFix")}</option>
              <option value="review">{t("tasks.modeReview")}</option>
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">{t("tasks.priority")}</span>
            <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="low">{t("tasks.priorityLow")}</option>
              <option value="normal">{t("tasks.priorityNormal")}</option>
              <option value="high">{t("tasks.priorityHigh")}</option>
            </Select>
          </label>
        </div>
      </div>
    </Modal>
  );
}
