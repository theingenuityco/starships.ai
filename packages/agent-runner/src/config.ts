import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * How a dispatch is turned into a local child process. The command is run via
 * spawn(command, args) with an argv ARRAY — never a shell string — so the
 * (remotely-supplied) prompt can't inject shell. `{{prompt}}`, `{{commandType}}`,
 * `{{dispatchId}}` and `{{sessionId}}` tokens inside any arg are substituted
 * before spawn. Using `{{sessionId}}` (e.g. `claude --session-id {{sessionId}}`)
 * makes the run's transcript locatable on disk afterwards.
 */
export interface ExecutorConfig {
  command: string;
  args: string[];
  /** Which payload field carries the prompt that replaces `{{prompt}}`. */
  promptField: string;
  /** Kill the child after this many ms. */
  timeoutMs: number;
  /** Also expose the dispatch to the child via STARSHIP_* env vars. */
  passPayloadEnv: boolean;
}

export interface RunnerConfig {
  /** Full MCP endpoint, e.g. http://host:4100/mcp */
  endpoint: string;
  /** Agent connection secret (sk-ship-…). */
  token: string;
  pollIntervalMs: number;
  /** Max dispatches claimed per poll. They are executed sequentially. */
  batchSize: number;
  executor: ExecutorConfig;
}

export const DEFAULT_EXECUTOR: ExecutorConfig = {
  command: 'claude',
  args: ['--session-id', '{{sessionId}}', '-p', '{{prompt}}'],
  promptField: 'prompt',
  timeoutMs: 10 * 60 * 1000,
  passPayloadEnv: true,
};

export const DEFAULT_CONFIG: Omit<RunnerConfig, 'endpoint' | 'token'> = {
  pollIntervalMs: 5000,
  batchSize: 1,
  executor: DEFAULT_EXECUTOR,
};

export function configDir(): string {
  return join(homedir(), '.starship-agent');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

/**
 * Tokenize a command line, honoring single/double quotes so multi-word args
 * survive (e.g. `claude --system "be concise" -p {{prompt}}` → 5 tokens).
 * Does not handle escaped quotes — that's a deliberate simplification.
 */
export function tokenizeCommand(s: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

/** Parse a command line into command + args (quote-aware). */
export function parseExecutorString(s: string): Pick<ExecutorConfig, 'command' | 'args'> | null {
  const parts = tokenizeCommand(s.trim());
  if (parts.length === 0) return null;
  return { command: parts[0], args: parts.slice(1) };
}

/**
 * Load config from the file, then layer environment overrides on top
 * (so a server can run with no interactive setup). Returns a partial — call
 * sites validate that `endpoint` and `token` are present.
 */
export function loadConfig(): Partial<RunnerConfig> {
  let fromFile: Partial<RunnerConfig> = {};
  const path = configPath();
  if (existsSync(path)) {
    try {
      fromFile = JSON.parse(readFileSync(path, 'utf8')) as Partial<RunnerConfig>;
    } catch (e) {
      throw new Error(`Could not parse ${path}: ${(e as Error).message}`);
    }
  }

  const merged: Partial<RunnerConfig> = {
    ...DEFAULT_CONFIG,
    ...fromFile,
    executor: { ...DEFAULT_EXECUTOR, ...(fromFile.executor ?? {}) },
  };

  if (process.env.STARSHIP_MCP_URL) merged.endpoint = process.env.STARSHIP_MCP_URL;
  if (process.env.STARSHIP_AGENT_TOKEN) merged.token = process.env.STARSHIP_AGENT_TOKEN;
  if (process.env.STARSHIP_EXECUTOR) {
    const parsed = parseExecutorString(process.env.STARSHIP_EXECUTOR);
    if (parsed) merged.executor = { ...(merged.executor as ExecutorConfig), ...parsed };
  }

  return merged;
}

/** Persist config with owner-only permissions (it holds the agent secret). */
export function saveConfig(config: RunnerConfig): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = configPath();
  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
  // Re-assert mode in case the file already existed with looser perms.
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best effort */
  }
}

/** Ensure a loaded config has the fields the runner cannot operate without. */
export function assertRunnable(config: Partial<RunnerConfig>): asserts config is RunnerConfig {
  if (!config.endpoint) throw new Error('No MCP endpoint configured. Run `starship-agent init` or set STARSHIP_MCP_URL.');
  if (!config.token) throw new Error('No agent token configured. Run `starship-agent init` or set STARSHIP_AGENT_TOKEN.');
}
