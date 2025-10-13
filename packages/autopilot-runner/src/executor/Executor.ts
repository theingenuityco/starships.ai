export interface ExecuteInput {
  blueprintJson: string;
  executionJson: string;
  configJson: string;
  timeoutMs?: number;
  onEvent?: (chunk: { type: string; data: unknown }) => Promise<void> | void;
}

export interface Executor {
  execute(input: ExecuteInput): Promise<unknown>;
}
