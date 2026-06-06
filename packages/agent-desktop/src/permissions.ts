// App-owned tool-permission policy. We drive agent CLIs headlessly (no human to
// answer approval prompts), so anything a CLI considers permission-gated is denied
// by default — the user hit this with WebSearch on Claude Code. Rather than bake
// `--allowedTools` into executor strings, a persona carries a policy and we compile
// it into the *target CLI's own* approval flags at run time. "Allow all" maps cleanly
// to every runtime; a fine-grained tool allowlist only translates to some (see table).
import type { RuntimeKind } from './store';

export interface PermissionPolicy {
  /** 'all' = let the agent use any tool unattended; 'allowlist' = only `allow`. */
  mode: 'all' | 'allowlist';
  /** Tool patterns for 'allowlist' mode, e.g. 'WebSearch', 'Read', 'Bash(git *)'. */
  allow: string[];
}

/** Absent policy → allow everything, so existing personas keep working unchanged. */
export const DEFAULT_PERMISSIONS: PermissionPolicy = { mode: 'all', allow: [] };

/** Tools offered as checkboxes when a runtime supports a tool-name allowlist. */
export const COMMON_TOOLS = ['WebSearch', 'WebFetch', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'TodoWrite'];

/**
 * Kinds that can honor a tool-name allowlist. Others can still 'all'-bypass, but in
 * 'allowlist' mode they fall back to their default approvals (coarse, but safe).
 */
export const SUPPORTS_ALLOWLIST: RuntimeKind[] = ['claude-code'];

/** Approval-related flags per kind; if the user's executor already has one, we don't inject. */
const APPROVAL_FLAG_HINTS: Partial<Record<RuntimeKind, string[]>> = {
  'claude-code': ['--permission-mode', '--settings', '--dangerously-skip-permissions', '--allowedTools', '--allowed-tools'],
  codex: ['--dangerously-bypass-approvals-and-sandbox', '--ask-for-approval', '-a ', '--sandbox', '-s '],
  hermes: ['--yolo', '--toolsets', '-t '],
  openclaw: ['--yolo'],
  custom: [],
};

/**
 * Translate a policy into the target CLI's approval flags, to APPEND to argv (after the
 * prompt — trailing options parse cleanly in commander/clap/yargs and this avoids the
 * codex subcommand-position problem). Returns [] when the user's executor already sets an
 * approval flag, or for custom/unknown kinds (the executor is then authoritative).
 *
 * Flags are verified against each CLI's `--help` where the CLI is installed; entries marked
 * TODO are best-effort from docs and fall back to [] until confirmed, so we never inject an
 * unverified flag.
 */
export function permissionArgs(kind: RuntimeKind, executor: string, policy: PermissionPolicy): string[] {
  const hints = APPROVAL_FLAG_HINTS[kind] ?? [];
  if (hints.some((h) => executor.includes(h.trim()))) return [];

  const all = policy.mode === 'all';
  const list = policy.allow.map((t) => t.trim()).filter(Boolean);

  switch (kind) {
    case 'claude-code':
      // bypassPermissions allows everything; otherwise the allow-list is enough — in
      // headless `-p` anything not listed can't be prompted for, so it's denied.
      return all
        ? ['--permission-mode', 'bypassPermissions']
        : ['--settings', JSON.stringify({ permissions: { allow: list } })];

    case 'codex':
      // No tool-name allowlist concept; only the all-bypass maps. Restrict → default approvals.
      return all ? ['--dangerously-bypass-approvals-and-sandbox'] : [];

    case 'hermes':
      // --yolo bypasses approvals; --toolsets is a coarse, toolset-level approximation.
      return all ? ['--yolo'] : list.length ? ['--toolsets', list.join(',')] : [];

    case 'openclaw':
      // OpenClaw approval flags unverified locally (couldn't run). Best-effort all-bypass only.
      return all ? ['--yolo'] : []; // TODO: verify openclaw approval flags

    case 'custom':
    default:
      // User owns the full executor; never inject.
      return [];
  }
}

/**
 * Flags that switch a runtime into a structured, streamable output mode so the app can
 * render the conversation live (verified against each CLI's official docs). Returns [] when
 * the executor already sets the relevant flag, or for runtimes that only stream plain text
 * (hermes/openclaw/custom) — those stream their raw stdout lines as-is.
 */
export function streamArgs(kind: RuntimeKind, executor: string): string[] {
  switch (kind) {
    case 'claude-code':
      // Token-by-token: stream-json requires --verbose; --include-partial-messages adds text deltas.
      return executor.includes('--output-format') ? [] : ['--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    case 'codex':
      // `codex exec --json` emits a JSONL event stream (thread.*/turn.*/item.*).
      return executor.includes('--json') ? [] : ['--json'];
    default:
      return [];
  }
}
