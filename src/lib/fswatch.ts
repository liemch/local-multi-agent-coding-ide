import chokidar, { type FSWatcher } from "chokidar";

type Listener = (event: { type: string; path: string }) => void;

interface WatchEntry {
  watcher: FSWatcher;
  listeners: Set<Listener>;
}

const globalStore = globalThis as typeof globalThis & {
  __ideWatchers?: Map<string, WatchEntry>;
};

const watchers = globalStore.__ideWatchers ?? new Map<string, WatchEntry>();
globalStore.__ideWatchers = watchers;

export function subscribeWorkspaceWatch(root: string, listener: Listener): () => void {
  let entry = watchers.get(root);
  if (!entry) {
    const watcher = chokidar.watch(root, {
      ignored: (p) => /node_modules|\.git(\/|$)|\.next/.test(p),
      ignoreInitial: true,
      persistent: true,
      depth: 12,
    });
    entry = { watcher, listeners: new Set() };
    watchers.set(root, entry);
    const notify = (type: string) => (p: string) => {
      for (const l of entry!.listeners) l({ type, path: p });
    };
    watcher.on("add", notify("add"));
    watcher.on("change", notify("change"));
    watcher.on("unlink", notify("unlink"));
    watcher.on("addDir", notify("addDir"));
    watcher.on("unlinkDir", notify("unlinkDir"));
  }
  entry.listeners.add(listener);
  return () => {
    entry!.listeners.delete(listener);
    if (entry!.listeners.size === 0) {
      entry!.watcher.close().catch(() => {});
      watchers.delete(root);
    }
  };
}
