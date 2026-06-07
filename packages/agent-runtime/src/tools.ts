// The native tool surface. Minimal first (bash, fs read/write/list, http fetch);
// every tool is workspace-scoped and cancellable. Sensitive tools are flagged so the
// permission layer can gate them.
//
// Tools are defined WITHOUT an AI SDK `execute` fn on purpose: the runtime drives a
// manual agent loop so it can gate each call on approval before running it. The actual
// implementations live here in `execute` and are invoked by runtime.ts.
import { spawn } from 'node:child_process';
import { readdir, readFile, mkdir, writeFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

const MAX_OUTPUT = 100_000;
const DEFAULT_EXEC_TIMEOUT_MS = 120_000;

function clip(s: string): string {
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n…[truncated]` : s;
}

/** True if `a`/`b` (a relative path from path.relative) escapes its base. */
function escapes(rel: string): boolean {
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

/**
 * Resolve `p` inside `workspace`, refusing paths that escape it lexically OR via symlink.
 * path.resolve/relative only see the lexical path, so a symlink inside the workspace pointing
 * out (workspace/link -> /etc) would otherwise pass. After the lexical check we realpath the
 * target — or its nearest existing ancestor, for not-yet-created files — and re-assert containment.
 */
async function resolveInWorkspace(workspace: string, p: string): Promise<string> {
  const abs = path.resolve(workspace, p);
  if (escapes(path.relative(workspace, abs))) {
    throw new Error(`Path escapes the workspace: ${p}`);
  }
  const realWs = await realpath(workspace);
  let probe = abs;
  for (;;) {
    try {
      if (escapes(path.relative(realWs, await realpath(probe)))) {
        throw new Error(`Path escapes the workspace via symlink: ${p}`);
      }
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      const parent = path.dirname(probe);
      if (parent === probe) break; // reached the filesystem root
      probe = parent;
    }
  }
  return abs;
}

/** Hostname of `url`, IPv6 brackets stripped and lowercased. */
function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** True if `host` is a loopback / private / link-local target we refuse to fetch (SSRF guard). */
function isBlockedHost(host: string): boolean {
  return (
    ['127.0.0.1', '0.0.0.0', 'localhost', '::1', '::'].includes(host) ||
    host.endsWith('.localhost') ||
    /^(10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    // IPv6 link-local/ULA, plus IPv4-mapped IPv6 (::ffff:127.0.0.1) wholesale.
    (host.includes(':') && /^(fe80|fc|fd|::ffff:)/.test(host))
  );
}

export interface ToolContext {
  workspace: string;
  signal: AbortSignal;
}

export interface RuntimeTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  /** Whether a call should be confirmed even when not explicitly allowed. */
  sensitive: boolean;
  /** Run the tool. Returns a string rendered as the tool result. */
  execute: (input: unknown, ctx: ToolContext) => Promise<string>;
}

function runBash(command: string, ctx: ToolContext): Promise<string> {
  return new Promise((resolve) => {
    // Strip provider keys from the child env so a prompt-injected command can't exfiltrate them.
    const safeEnv = { ...process.env };
    delete safeEnv.ANTHROPIC_API_KEY;
    delete safeEnv.OPENAI_API_KEY;
    // detached:true puts the child in its own process group so we can signal the whole tree
    // (negative pid) — otherwise backgrounded forks (`sleep 1000 &`) outlive the timeout/abort.
    const child = spawn('bash', ['-c', command], { cwd: ctx.workspace, env: safeEnv, detached: true });
    let out = '';
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {
        child.kill('SIGTERM'); // group already gone / pid reaped
      }
    };
    const onAbort = () => kill();
    if (ctx.signal.aborted) onAbort();
    else ctx.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(kill, DEFAULT_EXEC_TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
      resolve(`Failed to start command: ${e.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
      const tail = out.trim() || '(no output)';
      resolve(clip(code === 0 ? tail : `${tail}\n(exit ${code ?? 'null'})`));
    });
  });
}

export const TOOLS: RuntimeTool[] = [
  {
    name: 'bash',
    description: 'Run a shell command in the workspace and return its combined stdout/stderr.',
    inputSchema: z.object({ command: z.string().describe('The shell command to run.') }),
    sensitive: true,
    execute: (input, ctx) => runBash((input as { command: string }).command, ctx),
  } as RuntimeTool,
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file relative to the workspace root.',
    inputSchema: z.object({ path: z.string().describe('Path relative to the workspace root.') }),
    sensitive: false,
    execute: async (input, ctx) => {
      const abs = await resolveInWorkspace(ctx.workspace, (input as { path: string }).path);
      return clip(await readFile(abs, 'utf8'));
    },
  } as RuntimeTool,
  {
    name: 'write_file',
    description: 'Write (creating or overwriting) a UTF-8 text file relative to the workspace root.',
    inputSchema: z.object({
      path: z.string().describe('Path relative to the workspace root.'),
      content: z.string().describe('Full file contents to write.'),
    }),
    sensitive: true,
    execute: async (input, ctx) => {
      const { path: p, content } = input as { path: string; content: string };
      const abs = await resolveInWorkspace(ctx.workspace, p);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
      return `Wrote ${content.length} bytes to ${p}`;
    },
  } as RuntimeTool,
  {
    name: 'list_dir',
    description: 'List entries in a directory relative to the workspace root.',
    inputSchema: z.object({ path: z.string().default('.').describe('Directory relative to the workspace root.') }),
    sensitive: false,
    execute: async (input, ctx) => {
      const abs = await resolveInWorkspace(ctx.workspace, (input as { path?: string }).path ?? '.');
      const entries = await readdir(abs, { withFileTypes: true });
      const lines = await Promise.all(
        entries.map(async (e) => {
          if (e.isDirectory()) return `${e.name}/`;
          try {
            const s = await stat(path.join(abs, e.name));
            return `${e.name}\t${s.size}b`;
          } catch {
            return e.name;
          }
        })
      );
      return clip(lines.join('\n') || '(empty)');
    },
  } as RuntimeTool,
  {
    name: 'http_fetch',
    description: 'Fetch a URL (GET) and return the status and response body.',
    inputSchema: z.object({ url: z.string().url().describe('Absolute URL to fetch.') }),
    // Gated under allowlist mode: it can reach the network, so it needs approval like bash.
    sensitive: true,
    execute: async (input, ctx) => {
      const { url } = input as { url: string };
      // Block SSRF to loopback / private / link-local destinations (approval server, routers,
      // cloud metadata, CGNAT). Check the initial URL...
      if (isBlockedHost(hostOf(url))) {
        return 'Fetching loopback, private, or link-local addresses is not permitted.';
      }
      const res = await fetch(url, { signal: ctx.signal });
      // ...and the final URL, since fetch follows redirects and one could land on a blocked host.
      if (res.url && res.url !== url && isBlockedHost(hostOf(res.url))) {
        return 'Redirect to a loopback, private, or link-local address is not permitted.';
      }
      const body = await res.text();
      return clip(`HTTP ${res.status} ${res.statusText}\n\n${body}`);
    },
  } as RuntimeTool,
];

export const TOOLS_BY_NAME: Record<string, RuntimeTool> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Build the AI SDK tool map (no `execute` — the runtime gates + runs each call itself). */
export function buildSdkTools(): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const t of TOOLS) {
    // The schema is cast to sidestep tool()'s deep generic inference; we validate inputs
    // ourselves with `inputSchema.parse` in runtime.ts before executing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out[t.name] = tool({ description: t.description, inputSchema: t.inputSchema as any });
  }
  return out;
}
