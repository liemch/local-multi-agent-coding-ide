"use client";

import { useEffect, useState } from "react";
import { useWorkspaceStore, type WorkspaceInfo } from "@/stores/workspace-store";
import { FirstRun } from "@/features/workspace/FirstRun";
import { IdeShell } from "@/features/workspace/IdeShell";
import { api } from "@/lib/api-client";

const LAST_WORKSPACE_KEY = "ide.lastWorkspaceId";

export default function HomePage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const [restoring, setRestoring] = useState(true);

  // Reopen the last project so a reload drops you straight back into the IDE.
  useEffect(() => {
    const id = window.localStorage.getItem(LAST_WORKSPACE_KEY);
    if (!id) {
      setRestoring(false);
      return;
    }
    api
      .get<{ workspace: WorkspaceInfo }>(`/api/workspaces/${id}`)
      .then((response) => setWorkspace(response.workspace))
      .catch(() => window.localStorage.removeItem(LAST_WORKSPACE_KEY))
      .finally(() => setRestoring(false));
  }, [setWorkspace]);

  useEffect(() => {
    if (workspace) window.localStorage.setItem(LAST_WORKSPACE_KEY, workspace.id);
    else window.localStorage.removeItem(LAST_WORKSPACE_KEY);
  }, [workspace]);

  if (restoring) {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-500">…</main>;
  }

  return workspace ? <IdeShell /> : <FirstRun />;
}
