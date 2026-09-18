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

export interface OpenFile {
  path: string;
  content: string;
  originalContent: string;
  mtimeMs: number;
  dirty: boolean;
  externallyChanged: boolean;
  diskContent?: string;
}

export type MainTab = "dashboard" | "ide" | "tasks" | "git" | "agents" | "settings";

interface StoreState {
  workspace: WorkspaceInfo | null;
  setWorkspace: (workspace: WorkspaceInfo | null) => void;

  activeTab: MainTab;
  setActiveTab: (tab: MainTab) => void;

  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;

  openFiles: OpenFile[];
  activeFilePath: string | null;
  openFile: (file: OpenFile) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileSaved: (path: string, mtimeMs: number) => void;
  markExternalChange: (path: string, diskContent: string, mtimeMs: number) => void;
  resolveExternalChange: (path: string, action: "reload" | "keep") => void;

  refreshTick: number;
  bumpRefresh: () => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  createTaskOpen: boolean;
  setCreateTaskOpen: (open: boolean) => void;

  terminalVisible: boolean;
  toggleTerminal: () => void;
  setTerminalVisible: (visible: boolean) => void;
}

export const useWorkspaceStore = create<StoreState>((set) => ({
  workspace: null,
  setWorkspace: (workspace) =>
    set({ workspace, openFiles: [], activeFilePath: null, selectedTaskId: null }),

  activeTab: "dashboard",
  setActiveTab: (activeTab) => set({ activeTab }),

  selectedTaskId: null,
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),

  openFiles: [],
  activeFilePath: null,

  openFile: (file) =>
    set((state) => {
      const existing = state.openFiles.find((f) => f.path === file.path);
      if (existing) return { activeFilePath: file.path };
      return { openFiles: [...state.openFiles, file], activeFilePath: file.path };
    }),

  closeFile: (path) =>
    set((state) => {
      const openFiles = state.openFiles.filter((f) => f.path !== path);
      const activeFilePath =
        state.activeFilePath === path ? (openFiles.length ? openFiles[openFiles.length - 1].path : null) : state.activeFilePath;
      return { openFiles, activeFilePath };
    }),

  setActiveFile: (activeFilePath) => set({ activeFilePath }),

  updateFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((file) =>
        file.path === path ? { ...file, content, dirty: content !== file.originalContent } : file,
      ),
    })),

  markFileSaved: (path, mtimeMs) =>
    set((state) => ({
      openFiles: state.openFiles.map((file) =>
        file.path === path
          ? { ...file, originalContent: file.content, dirty: false, mtimeMs, externallyChanged: false, diskContent: undefined }
          : file,
      ),
    })),

  markExternalChange: (path, diskContent, mtimeMs) =>
    set((state) => ({
      openFiles: state.openFiles.map((file) =>
        file.path === path ? { ...file, externallyChanged: true, diskContent, mtimeMs } : file,
      ),
    })),

  resolveExternalChange: (path, action) =>
    set((state) => ({
      openFiles: state.openFiles.map((file) => {
        if (file.path !== path) return file;
        if (action === "reload" && file.diskContent !== undefined) {
          return {
            ...file,
            content: file.diskContent,
            originalContent: file.diskContent,
            dirty: false,
            externallyChanged: false,
            diskContent: undefined,
          };
        }
        return { ...file, externallyChanged: false, diskContent: undefined, dirty: true };
      }),
    })),

  refreshTick: 0,
  bumpRefresh: () => set((state) => ({ refreshTick: state.refreshTick + 1 })),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

  createTaskOpen: false,
  setCreateTaskOpen: (createTaskOpen) => set({ createTaskOpen }),

  terminalVisible: true,
  toggleTerminal: () => set((state) => ({ terminalVisible: !state.terminalVisible })),
  setTerminalVisible: (terminalVisible) => set({ terminalVisible }),
}));
