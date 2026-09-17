"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor, { DiffEditor, loader } from "@monaco-editor/react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/lib/api-client";
import { Button, EmptyState, Panel, cn } from "@/components/ui/primitives";

// Serve Monaco from the app itself so the IDE works fully offline (local-first).
loader.config({ paths: { vs: "/monaco/vs" } });

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    sh: "shell",
    bash: "shell",
    yml: "yaml",
    yaml: "yaml",
    toml: "ini",
    sql: "sql",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
  };
  return map[ext] ?? "plaintext";
}

export function CodeEditor() {
  const { t } = useI18n();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const closeFile = useWorkspaceStore((s) => s.closeFile);
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const markFileSaved = useWorkspaceStore((s) => s.markFileSaved);
  const markExternalChange = useWorkspaceStore((s) => s.markExternalChange);
  const resolveExternalChange = useWorkspaceStore((s) => s.resolveExternalChange);

  const [showDiff, setShowDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const activeFile = openFiles.find((file) => file.path === activeFilePath) ?? null;

  // The Ctrl+S handler is registered once, so it needs a ref to reach the
  // file that is active at the moment the shortcut fires.
  const activeRef = useRef(activeFile);
  useEffect(() => {
    activeRef.current = activeFile;
  }, [activeFile]);

  const save = useCallback(async () => {
    const file = activeRef.current;
    if (!workspace || !file || !file.dirty) return;
    setSaving(true);
    try {
      const response = await api.put<{ ok: boolean; mtimeMs: number }>("/api/fs/file", {
        workspaceId: workspace.id,
        path: file.path,
        content: file.content,
      });
      markFileSaved(file.path, response.mtimeMs);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [workspace, markFileSaved]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  // Detect changes made on disk (e.g. by an agent) to the file we have open.
  useEffect(() => {
    if (!workspace || !openFiles.length) return;
    const source = new EventSource(`/api/fs/watch?workspaceId=${workspace.id}`);

    source.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data) as { path?: string };
        if (!payload.path) return;
        const relative = payload.path.startsWith(workspace.path)
          ? payload.path.slice(workspace.path.length + 1).split("\\").join("/")
          : payload.path;

        const tracked = useWorkspaceStore.getState().openFiles.find((file) => file.path === relative);
        if (!tracked) return;

        const response = await api.get<{ content?: string; mtimeMs: number }>(
          `/api/fs/file?workspaceId=${workspace.id}&path=${encodeURIComponent(relative)}&confirmed=1`,
        );
        if (response.content === undefined || response.content === null) return;
        if (response.content === tracked.content) {
          // Our own save echoed back; just refresh the timestamp.
          if (!tracked.dirty) markFileSaved(relative, response.mtimeMs);
          return;
        }
        markExternalChange(relative, response.content, response.mtimeMs);
      } catch {
        // ignore malformed events
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [workspace, openFiles.length, markExternalChange, markFileSaved]);

  if (!openFiles.length) {
    return (
      <Panel title={t("editor.title")} className="h-full">
        <EmptyState title={t("editor.noFile")} hint={t("editor.noFileHint")} />
      </Panel>
    );
  }

  return (
    <Panel
      title={t("editor.title")}
      actions={
        activeFile ? (
          <>
            {activeFile.dirty ? (
              <span className="mr-1 text-[11px] text-amber-400">● {t("editor.unsaved")}</span>
            ) : (
              <span className="mr-1 text-[11px] text-slate-600">{t("editor.saved")}</span>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowDiff((value) => !value)}>
              {showDiff ? t("editor.normalView") : t("editor.diffView")}
            </Button>
            <Button size="sm" variant="primary" disabled={!activeFile.dirty || saving} onClick={() => void save()}>
              {t("editor.save")}
            </Button>
          </>
        ) : null
      }
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div className="flex shrink-0 gap-px overflow-x-auto border-b border-white/5 bg-[#0b0d12]">
        {openFiles.map((file) => (
          <div
            key={file.path}
            className={cn(
              "group flex items-center gap-2 border-r border-white/5 px-3 py-1.5 text-xs",
              file.path === activeFilePath ? "bg-[#0f1219] text-slate-100" : "text-slate-500 hover:text-slate-300",
            )}
          >
            <button onClick={() => setActiveFile(file.path)} className="max-w-[160px] truncate" title={file.path}>
              {file.dirty ? "● " : ""}
              {file.path.split("/").pop()}
            </button>
            <button
              onClick={() => closeFile(file.path)}
              className="text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-400"
              aria-label={t("common.close")}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {activeFile?.externallyChanged ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <span>{t("editor.externalChangeTitle")}</span>
          <Button size="sm" variant="subtle" onClick={() => resolveExternalChange(activeFile.path, "reload")}>
            {t("editor.reload")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowDiff(true)}>
            {t("editor.compare")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => resolveExternalChange(activeFile.path, "keep")}>
            {t("editor.keepCurrent")}
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {activeFile ? (
          showDiff ? (
            <DiffEditor
              height="100%"
              theme="vs-dark"
              language={languageFor(activeFile.path)}
              original={activeFile.diskContent ?? activeFile.originalContent}
              modified={activeFile.content}
              options={{ readOnly: true, renderSideBySide: true, fontSize: 13, minimap: { enabled: false } }}
            />
          ) : (
            <Editor
              height="100%"
              theme="vs-dark"
              path={activeFile.path}
              language={languageFor(activeFile.path)}
              value={activeFile.content}
              onChange={(value) => updateFileContent(activeFile.path, value ?? "")}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                renderWhitespace: "selection",
              }}
            />
          )
        ) : null}
      </div>
    </Panel>
  );
}
