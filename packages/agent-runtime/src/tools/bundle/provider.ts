// User toolset bundle provider. One local directory = one toolset. Two runtimes share the
// ToolDescriptor seam:
//   - 'process' (default, safe-ish): each tool is an executable in any language. Input is
//     passed as JSON on stdin; stdout is the tool_result; nonzero exit = error. Runs as a
//     subprocess scoped to the workspace with provider keys scrubbed. Capabilities are
//     declared (surfaced at approval), not yet sandbox-enforced.
//   - 'node' (trusted): the bundle's compiled entry module exports handlers called in-process.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { clip, DEFAULT_EXEC_TIMEOUT_MS } from '../shared';
import type { Capability, ToolContext, ToolDescriptor, ToolResult, ToolsetProvider } from '../types';
import { ManifestSchema, type Manifest, type ToolManifest } from './manifest';

const KNOWN_CAPS: ReadonlySet<string> = new Set<Capability>(['fs:workspace', 'fs:read', 'network', 'exec', 'secrets']);

/** A node-runtime handler: called in-process with the validated input + tool context. */
type NodeHandler = (input: unknown, ctx: ToolContext) => Promise<string | ToolResult> | string | ToolResult;

export class BundleProvider implements ToolsetProvider {
  readonly source = 'user' as const;
  private manifest?: Manifest;
  private readonly byName = new Map<string, ToolManifest>();
  private nodeHandlers?: Record<string, NodeHandler>;

  constructor(
    readonly name: string,
    private readonly dir: string
  ) {}

  async init(): Promise<ToolDescriptor[]> {
    const raw = await readFile(path.join(this.dir, 'toolset.json'), 'utf8');
    const manifest = ManifestSchema.parse(JSON.parse(raw));
    this.manifest = manifest;

    if (manifest.runtime === 'node') {
      if (!manifest.entry) throw new Error(`Bundle "${this.name}" is runtime:node but has no "entry"`);
      const mod = (await import(pathToFileURL(path.join(this.dir, manifest.entry)).href)) as Record<string, unknown>;
      // Accept either a `tools` export map or top-level named exports.
      this.nodeHandlers = ((mod.tools as Record<string, NodeHandler>) ?? mod) as Record<string, NodeHandler>;
    }

    return manifest.tools.map((t) => {
      this.byName.set(t.name, t);
      const capabilities = t.capabilities.filter((c): c is Capability => KNOWN_CAPS.has(c));
      return {
        fqn: `${this.name}.${t.name}`,
        name: t.name,
        toolset: this.name,
        description: t.description,
        schema: { kind: 'json', schema: t.input },
        sensitive: t.sensitive,
        capabilities,
        residency: 'deferred',
      };
    });
  }

  async execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.byName.get(name);
    if (!tool || !this.manifest) return { output: `Unknown tool: ${this.name}.${name}`, error: true };

    if (this.manifest.runtime === 'node') {
      const handler = this.nodeHandlers?.[tool.handler ?? name];
      if (typeof handler !== 'function') return { output: `Bundle "${this.name}" has no handler for ${name}`, error: true };
      const out = await handler(input, ctx);
      return typeof out === 'string' ? { output: clip(out) } : { output: clip(out.output), error: out.error };
    }

    if (!tool.run) return { output: `Tool ${this.name}.${name} has no run command`, error: true };
    return this.runProcess(tool.run.command, input, ctx);
  }

  /** Spawn a process-runtime tool: argv (command[0] resolved against the bundle dir), input as
   *  JSON on stdin, stdout as the result. Same process-group kill + timeout + abort as bash. */
  private runProcess(command: string[], input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const [cmd, ...args] = command;
    const resolved = cmd.startsWith('.') || cmd.startsWith('/') ? path.resolve(this.dir, cmd) : cmd;
    return new Promise((resolve) => {
      const safeEnv: NodeJS.ProcessEnv = { ...process.env, ...ctx.env, STARSHIP_WORKSPACE: ctx.workspace };
      delete safeEnv.ANTHROPIC_API_KEY;
      delete safeEnv.OPENAI_API_KEY;
      const child = spawn(resolved, args, { cwd: ctx.workspace, env: safeEnv, detached: true });
      let out = '';
      let err = '';
      const kill = () => {
        try {
          if (child.pid) process.kill(-child.pid, 'SIGTERM');
          else child.kill('SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
      };
      const onAbort = () => kill();
      if (ctx.signal.aborted) onAbort();
      else ctx.signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(kill, DEFAULT_EXEC_TIMEOUT_MS);
      child.stdout.on('data', (d) => (out += d.toString()));
      child.stderr.on('data', (d) => (err += d.toString()));
      child.on('error', (e) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener('abort', onAbort);
        resolve({ output: `Failed to start ${this.name}.${command[0]}: ${e.message}`, error: true });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener('abort', onAbort);
        const body = out.trim() || err.trim() || '(no output)';
        resolve(code === 0 ? { output: clip(body) } : { output: clip(`${body}\n(exit ${code ?? 'null'})`), error: true });
      });
      // Hand the validated input to the tool as JSON on stdin.
      child.stdin.end(JSON.stringify(input ?? {}));
    });
  }
}

export function buildBundleProvider(name: string, dir: string): BundleProvider {
  return new BundleProvider(name, dir);
}
