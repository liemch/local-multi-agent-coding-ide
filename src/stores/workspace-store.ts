"use client";

import { create } from "zustand";

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  gitRepository: boolean;
  branch: string | null;
  createdAt: string;
  lastOpenedAt: string;
}

export type MainTab = "dashboard" | "ide" | "tasks" | "git" | "agents" | "settings";

interface StoreState {
  workspace: WorkspaceInfo | null;
  setWorkspace: (w: WorkspaceInfo | null) => void;
  activeTab: MainTab;
  setActiveTab: (t: MainTab) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  refreshTick: number;
  bumpRefresh: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;
  createTaskOpen: boolean;
  setCreateTaskOpen: (v: boolean) => void;
}

export const useWorkspaceStore = create<StoreState>((set) => ({
  workspace: null,
  setWorkspace: (w) => set({ workspace: w }),
  activeTab: "dashboard",
  setActiveTab: (t) => set({ activeTab: t }),
  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  refreshTick: 0,
  bumpRefresh: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  createTaskOpen: false,
  setCreateTaskOpen: (v) => set({ createTaskOpen: v }),
}));
