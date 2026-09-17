export interface BusEvent {
  taskId: string;
  type: string;
  message: string;
  agent?: string | null;
  meta?: Record<string, unknown>;
  createdAt: string;
}

type Listener = (event: BusEvent) => void;

const globalStore = globalThis as typeof globalThis & {
  __ideTaskListeners?: Map<string, Set<Listener>>;
  __ideGlobalListeners?: Set<Listener>;
};

const taskListeners = globalStore.__ideTaskListeners ?? new Map<string, Set<Listener>>();
globalStore.__ideTaskListeners = taskListeners;

const globalListeners = globalStore.__ideGlobalListeners ?? new Set<Listener>();
globalStore.__ideGlobalListeners = globalListeners;

export function publish(event: BusEvent) {
  const set = taskListeners.get(event.taskId);
  if (set) for (const l of set) l(event);
  for (const l of globalListeners) l(event);
}

export function subscribeTask(taskId: string, listener: Listener): () => void {
  let set = taskListeners.get(taskId);
  if (!set) {
    set = new Set();
    taskListeners.set(taskId, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

export function subscribeAll(listener: Listener): () => void {
  globalListeners.add(listener);
  return () => globalListeners.delete(listener);
}
