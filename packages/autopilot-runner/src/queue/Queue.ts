export interface RunnerTask {
  requestId: string;
  blueprintJson: string;
  executionJson: string;
  configJson: string;
  priority?: number;
  timeoutMs?: number;
  // Optional streaming hook; server can attach to relay events
  onEvent?: (chunk: { type: string; data: unknown }) => Promise<void> | void;
}

export interface Queue<T> {
  enqueue(item: T): void;
  dequeue(): Promise<T>;
  size(): number;
}
