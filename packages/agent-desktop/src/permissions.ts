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
 * Kinds that render the COMMON_TOOLS checkboxes (Claude tool names). Others list tools as
 * free text, since their tool names differ (hermes: terminal/file/web; cursor/codex: shell).
 */
export const SUPPORTS_ALLOWLIST: RuntimeKind[] = ['claude-code'];

/**
 * Kinds that can ask for approval mid-run in allowlist mode (unlisted tools pop a dialog
 * instead of being denied). claude-code/hermes via hooks, codex via app-server. 'custom'
 * qualifies only when it's cursor-agent — the editor can't see the executor, so it shows
 * the list with a caveat. aider/gemini have no channel and fall back to static.
 */
export const SUPPORTS_APPROVAL: RuntimeKind[] = ['claude-code', 'hermes', 'codex', 'custom'];

/** Approval-related flags per kind; if the user's executor already has one, we don't inject. */
const APPROVAL_FLAG_HINTS: Partial<Record<RuntimeKind, string[]>> = {
  'claude-code': ['--permission-mode', '--settings', '--dangerously-skip-permissions', '--allowedTools', '--allowed-tools'],
  codex: ['--dangerously-bypass-approvals-and-sandbox', '--ask-for-approval', '-a ', '--sandbox', '-s '],
  hermes: ['--yolo', '--toolsets', '-t '],
  custom: [],
};

/**
 * The PreToolUse hook command we inject for claude-code in allowlist mode: a `curl`
 * one-liner that POSTs the hook event JSON (on stdin) to the loopback approval server
 * and prints the server's response (the allow/deny decision) on stdout. The server holds
 * the request open until the user answers the dialog, so a gated tool blocks here rather
 * than being silently denied. `--max-time` mirrors the server-side deny timeout.
 */
function preToolUseHookCommand(approvalPort: number, dispatchId: string): string {
  // The settings file is written per-run, so we bake the dispatchId straight into the curl
  // header (no reliance on env propagation to the hook subprocess) for correlation.
  return `curl -sS --max-time 600 -X POST -H "X-Starship-Dispatch: ${dispatchId}" --data-binary @- http://127.0.0.1:${approvalPort}/hook/claude`;
}

/**
 * The contents of the per-run claude settings FILE. Claude only loads hooks from settings
 * files (not inline `--settings` JSON), so the PreToolUse hook must live here. We force
 * `defaultMode: "default"` so a `bypassPermissions` in the user's own settings can't let
 * tools through un-gated; `allow: []` keeps every tool flowing through the hook (the webview
 * then auto-allows the persona's listed tools). Written via write_run_settings.
 */
export function claudeRunSettings(approvalPort: number, dispatchId: string): string {
  return JSON.stringify({
    permissions: { allow: [], defaultMode: 'default' },
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: preToolUseHookCommand(approvalPort, dispatchId) }] }],
    },
  });
}

/**
 * Translate a policy into the target CLI's approval flags, to APPEND to argv (after the
 * prompt — trailing options parse cleanly in commander/clap/yargs and this avoids the
 * codex subcommand-position problem). Returns [] when the user's executor already sets an
 * approval flag, or for custom/unknown kinds (the executor is then authoritative).
 *
 * `opts.claudeSettingsPath` (claude-code allowlist only): the path to a per-run settings
 * file the engine wrote (via writeRunSettings/claudeRunSettings) containing the PreToolUse
 * approval hook. We pass it with `--settings` + `--permission-mode default`. Hooks can't be
 * passed inline, so when there's no path we just restrict to the static allowlist.
 *
 * Flags are verified against each CLI's `--help` where the CLI is installed; entries marked
 * TODO are best-effort from docs and fall back to [] until confirmed, so we never inject an
 * unverified flag.
 */
export function permissionArgs(
  kind: RuntimeKind,
  executor: string,
  policy: PermissionPolicy,
  opts?: { claudeSettingsPath?: string }
): string[] {
  const hints = APPROVAL_FLAG_HINTS[kind] ?? [];
  if (hints.some((h) => executor.includes(h.trim()))) return [];

  const all = policy.mode === 'all';
  const list = policy.allow.map((t) => t.trim()).filter(Boolean);

  switch (kind) {
    case 'claude-code': {
      if (all) return ['--permission-mode', 'bypassPermissions'];
      // Allowlist mode: prefer the per-run settings FILE (carries the PreToolUse approval
      // hook + a default mode that overrides the user's own bypass). `default` mode makes
      // every gated tool consult the hook. Fall back to a static inline allowlist (no hook)
      // only when no file was written (e.g. the approval server didn't start).
      if (opts?.claudeSettingsPath) return ['--settings', opts.claudeSettingsPath, '--permission-mode', 'default'];
      return ['--settings', JSON.stringify({ permissions: { allow: list } })];
    }

    case 'codex':
      // Codex is driven via its app-server JSON-RPC path (see codexClient.ts), not flags:
      // approval policy + sandbox are set in `thread/start`, and gated calls are answered
      // over JSON-RPC. So we inject nothing here.
      return [];

    case 'hermes':
      // 'all' bypasses approvals with --yolo. In allowlist mode we install a `pre_tool_call`
      // hook (see hermesHook) for real mid-run approval, so no flags are injected here; the
      // listed tools are auto-allowed by the approvals store. (Hermes' hardline blocklist
      // still applies regardless.)
      return all ? ['--yolo'] : [];

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
 * (hermes/custom) — those stream their raw stdout lines as-is. (codex uses its own
 * app-server JSON-RPC path and never goes through here.)
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
