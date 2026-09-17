"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, type FileTreeNode } from "@/lib/api-client";
import { Button, EmptyState, Panel, cn } from "@/components/ui/primitives";
import { isSensitiveFile } from "@/lib/security-shared";

interface TreeResponse {
  tree: FileTreeNode[];
  gitStatus: Record<string, string>;
}

const GIT_TONE: Record<string, string> = {
  M: "text-amber-400",
  A: "text-emerald-400",
  D: "text-rose-400",
  R: "text-sky-400",
  "?": "text-slate-500",
  U: "text-fuchsia-400",
};

function TreeNode({
  node,
  depth,
  gitStatus,
  expanded,
  onToggle,
  onOpen,
  onContextMenu,
  activePath,
}: {
  node: FileTreeNode;
  depth: number;
  gitStatus: Record<string, string>;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (node: FileTreeNode) => void;
  onContextMenu: (event: React.MouseEvent, node: FileTreeNode) => void;
  activePath: string | null;
}) {
  const isOpen = expanded.has(node.path);
  const code = gitStatus[node.path];
  const sensitive = node.type === "file" && isSensitiveFile(node.name);

  return (
    <div>
      <button
        onClick={() => (node.type === "directory" ? onToggle(node.path) : onOpen(node))}
        onContextMenu={(event) => onContextMenu(event, node)}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left text-[13px] hover:bg-white/5",
          activePath === node.path && "bg-sky-500/15 text-sky-200",
        )}
        style={{ paddingLeft: depth * 12 + 6 }}
        title={node.path}
      >
        <span className="w-3 shrink-0 text-[10px] text-slate-500">
          {node.type === "directory" ? (isOpen ? "▾" : "▸") : ""}
        </span>
        <span className="shrink-0 text-xs">{node.type === "directory" ? "📁" : sensitive ? "🔒" : "📄"}</span>
        <span className={cn("truncate", code ? GIT_TONE[code] ?? "text-slate-300" : "text-slate-300")}>
          {node.name}
        </span>
        {code ? <span className={cn("ml-auto pr-1 text-[10px] font-bold", GIT_TONE[code])}>{code}</span> : null}
      </button>

      {node.type === "directory" && isOpen
        ? (node.children ?? []).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              gitStatus={gitStatus}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              activePath={activePath}
            />
          ))
        : null}
    </div>
  );
}

export function FileExplorer({ onOpenFile }: { onOpenFile: (path: string) => void }) {
  const { t } = useI18n();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const refreshTick = useWorkspaceStore((s) => s.refreshTick);
  const bumpRefresh = useWorkspaceStore((s) => s.bumpRefresh);

  const [data, setData] = useState<TreeResponse>({ tree: [], gitStatus: {} });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileTreeNode } | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const response = await api.get<TreeResponse>(`/api/fs/tree?workspaceId=${workspace.id}`);
      setData(response);
    } catch {
      setData({ tree: [], gitStatus: {} });
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  // Realtime refresh when the agent (or anything else) changes files — plan §11.
  useEffect(() => {
    if (!workspace) return;
    const source = new EventSource(`/api/fs/watch?workspaceId=${workspace.id}`);
    let timer: ReturnType<typeof setTimeout> | null = null;
    source.onmessage = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 400);
    };
    source.onerror = () => source.close();
    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [workspace, load]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const runOp = useCallback(
    async (action: string, targetPath: string, extra?: Record<string, unknown>) => {
      if (!workspace) return;
      try {
        await api.post("/api/fs/ops", { workspaceId: workspace.id, action, targetPath, ...extra });
        bumpRefresh();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
      }
    },
    [workspace, bumpRefresh],
  );

  const handleCreate = useCallback(
    async (parent: FileTreeNode | null, isDirectory: boolean) => {
      const name = window.prompt(t("explorer.namePrompt"));
      if (!name?.trim()) return;
      const base = parent ? (parent.type === "directory" ? parent.path : parent.path.split("/").slice(0, -1).join("/")) : "";
      const targetPath = base ? `${base}/${name.trim()}` : name.trim();
      await runOp(isDirectory ? "mkdir" : "create", targetPath);
    },
    [runOp, t],
  );

  const contextActions = useMemo(() => {
    if (!menu) return null;
    const node = menu.node;
    return (
      <div
        className="fixed z-50 min-w-[180px] overflow-hidden rounded-md border border-white/10 bg-[#161b26] py-1 text-[13px] shadow-xl"
        style={{ left: menu.x, top: menu.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {node.type === "directory" ? (
          <>
            <button className="block w-full px-3 py-1.5 text-left hover:bg-white/5" onClick={() => void handleCreate(node, false)}>
              {t("explorer.newFile")}
            </button>
            <button className="block w-full px-3 py-1.5 text-left hover:bg-white/5" onClick={() => void handleCreate(node, true)}>
              {t("explorer.newFolder")}
            </button>
          </>
        ) : null}
        <button
          className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
          onClick={async () => {
            const name = window.prompt(t("explorer.rename"), node.name);
            if (!name?.trim()) return;
            const parent = node.path.split("/").slice(0, -1).join("/");
            await runOp("rename", node.path, { newPath: parent ? `${parent}/${name.trim()}` : name.trim() });
          }}
        >
          {t("explorer.rename")}
        </button>
        <button
          className="block w-full px-3 py-1.5 text-left text-rose-300 hover:bg-white/5"
          onClick={async () => {
            if (!window.confirm(t("explorer.confirmDelete", { name: node.name }))) return;
            await runOp("delete", node.path);
          }}
        >
          {t("explorer.delete")}
        </button>
        <button
          className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
          onClick={() => void navigator.clipboard?.writeText(`${workspace?.path ?? ""}/${node.path}`)}
        >
          {t("common.copyPath")}
        </button>
      </div>
    );
  }, [menu, handleCreate, runOp, t, workspace]);

  if (!workspace) return null;

  return (
    <Panel
      title={t("explorer.title")}
      actions={
        <>
          <Button size="sm" variant="ghost" title={t("explorer.newFile")} onClick={() => void handleCreate(null, false)}>
            ＋
          </Button>
          <Button size="sm" variant="ghost" title={t("common.refresh")} onClick={() => void load()}>
            ⟳
          </Button>
        </>
      }
      className="h-full border-r border-white/5"
      bodyClassName="py-1"
    >
      {loading && !data.tree.length ? (
        <p className="px-3 py-2 text-xs text-slate-500">{t("common.loading")}</p>
      ) : data.tree.length === 0 ? (
        <EmptyState title={t("explorer.empty")} />
      ) : (
        data.tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            gitStatus={data.gitStatus}
            expanded={expanded}
            onToggle={toggle}
            onOpen={(n) => onOpenFile(n.path)}
            onContextMenu={(event, n) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, node: n });
            }}
            activePath={activeFilePath}
          />
        ))
      )}
      {contextActions}
    </Panel>
  );
}
