/**
 * System tools: the agent's built-in surface for working on a checkout.
 *
 * These run in-process inside the sandbox container, where the cwd IS the
 * mounted workspace, so they operate on the local filesystem directly (no
 * dispatch RPC). Every path is still resolved against, and confined to, the
 * configured cwd as defense in depth.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AgentTool, ToolResult } from '@/types';

const execAsync = promisify(exec);

const DEFAULT_BASH_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB
const GREP_MAX_RESULTS = 200;
const GLOB_MAX_RESULTS = 500;

/** Resolve `p` against the workspace root and reject anything that escapes it. */
function resolveInside(cwd: string, p: string): string {
  const base = path.resolve(cwd);
  // Treat a leading "/" as workspace-relative rather than filesystem-absolute.
  const rel = p.replace(/^[/\\]+/, '');
  const resolved = path.resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`path '${p}' escapes the workspace boundary`);
  }
  return resolved;
}

function isUnder(root: string, resolved: string): boolean {
  const base = path.resolve(root);
  return resolved === base || resolved.startsWith(base + path.sep);
}

/**
 * Resolve a path for READING. An absolute path that falls under one of
 * `readRoots` (e.g. the `/autopilot` definition mount) is allowed as-is; anything
 * else is resolved workspace-relative and confined to `cwd` (see resolveInside).
 * This preserves the leading-"/" = workspace-root convention for paths that are
 * not under a read root.
 */
function resolveForRead(cwd: string, readRoots: string[] | undefined, p: string): string {
  if (path.isAbsolute(p) && readRoots && readRoots.length > 0) {
    const resolved = path.resolve(p);
    if (readRoots.some((root) => isUnder(root, resolved))) return resolved;
  }
  return resolveInside(cwd, p);
}

function ok(content: unknown): ToolResult {
  return { content };
}

function fail(message: string): ToolResult {
  return { content: { error: message }, isError: true };
}

const bash: AgentTool = {
  name: 'bash',
  description:
    'Run a shell command in the workspace directory. Returns stdout, stderr, and the exit code. Use for git, build, test, and general shell work.',
  parameters: {
    type: 'object',
    required: ['command'],
    properties: {
      command: { type: 'string', description: 'The shell command to execute.' },
      timeoutMs: { type: 'number', description: `Timeout in milliseconds (default ${DEFAULT_BASH_TIMEOUT_MS}).` },
    },
  },
  async run(args, ctx) {
    const command = String(args.command ?? '').trim();
    if (!command) return fail('command is required');
    const timeout = typeof args.timeoutMs === 'number' && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_BASH_TIMEOUT_MS;
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ctx.cwd,
        timeout,
        maxBuffer: MAX_BUFFER,
        signal: ctx.signal,
      });
      return ok({ stdout, stderr, exitCode: 0 });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; message?: string };
      // Non-zero exit is a normal result, not a thrown failure: surface it to the model.
      return ok({
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? e.message ?? '',
        exitCode: typeof e.code === 'number' ? e.code : 1,
        ...(e.killed ? { killed: true } : {}),
      });
    }
  },
};

const read: AgentTool = {
  name: 'read',
  description: 'Read a UTF-8 text file from the workspace. Optionally slice by 1-based line range.',
  parameters: {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path.' },
      offset: { type: 'number', description: '1-based start line (optional).' },
      limit: { type: 'number', description: 'Max number of lines to return (optional).' },
    },
  },
  async run(args, ctx) {
    try {
      const filePath = resolveForRead(ctx.cwd, ctx.readRoots, String(args.path ?? ''));
      const raw = await fs.readFile(filePath, 'utf-8');
      const offset = typeof args.offset === 'number' ? args.offset : undefined;
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      if (offset === undefined && limit === undefined) return ok({ content: raw });
      const lines = raw.split('\n');
      const start = offset && offset > 0 ? offset - 1 : 0;
      const end = limit && limit > 0 ? start + limit : lines.length;
      return ok({ content: lines.slice(start, end).join('\n'), totalLines: lines.length });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
};

const write: AgentTool = {
  name: 'write',
  description: 'Write a UTF-8 text file in the workspace, creating parent directories and overwriting if it exists.',
  parameters: {
    type: 'object',
    required: ['path', 'content'],
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path.' },
      content: { type: 'string', description: 'Full file contents to write.' },
    },
  },
  async run(args, ctx) {
    try {
      const filePath = resolveInside(ctx.cwd, String(args.path ?? ''));
      const content = String(args.content ?? '');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return ok({ path: String(args.path), bytesWritten: Buffer.byteLength(content, 'utf-8') });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
};

const edit: AgentTool = {
  name: 'edit',
  description:
    'Replace an exact substring in a workspace file. By default `oldString` must occur exactly once; set replaceAll to replace every occurrence.',
  parameters: {
    type: 'object',
    required: ['path', 'oldString', 'newString'],
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path.' },
      oldString: { type: 'string', description: 'Exact text to replace.' },
      newString: { type: 'string', description: 'Replacement text.' },
      replaceAll: { type: 'boolean', description: 'Replace all occurrences instead of requiring exactly one.' },
    },
  },
  async run(args, ctx) {
    try {
      const filePath = resolveInside(ctx.cwd, String(args.path ?? ''));
      const oldString = String(args.oldString ?? '');
      const newString = String(args.newString ?? '');
      if (!oldString) return fail('oldString is required');
      const raw = await fs.readFile(filePath, 'utf-8');
      const count = raw.split(oldString).length - 1;
      if (count === 0) return fail('oldString not found in file');
      if (count > 1 && args.replaceAll !== true) {
        return fail(`oldString occurs ${count} times; pass replaceAll:true or provide a more specific string`);
      }
      const next = args.replaceAll === true ? raw.split(oldString).join(newString) : raw.replace(oldString, newString);
      await fs.writeFile(filePath, next, 'utf-8');
      return ok({ path: String(args.path), replacements: args.replaceAll === true ? count : 1 });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
};

const ls: AgentTool = {
  name: 'ls',
  description: 'List the entries of a workspace directory (defaults to the workspace root).',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative directory (default ".").' },
    },
  },
  async run(args, ctx) {
    try {
      const dir = resolveForRead(ctx.cwd, ctx.readRoots, String(args.path ?? '.'));
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return ok({
        entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other' })),
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
};

/** Convert a glob (supporting ** and *) to a RegExp anchored to a full relative path. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      // Brace expansion: {a,b} -> (a|b), e.g. src/**/*.{ts,tsx}. Alternatives are
      // matched literally (no nested glob metachars). Unclosed '{' is a literal.
      const close = glob.indexOf('}', i + 1);
      if (close !== -1) {
        const alts = glob
          .slice(i + 1, close)
          .split(',')
          .map((alt) => alt.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
        re += '(' + alts.join('|') + ')';
        i = close;
      } else {
        re += '\\{';
      }
    } else if (c === '[') {
      // Bracket expression: [tj]s -> regex char class, passed through verbatim for
      // simple cases. Unclosed '[' is a literal.
      const close = glob.indexOf(']', i + 1);
      if (close !== -1) {
        re += glob.slice(i, close + 1);
        i = close;
      } else {
        re += '\\[';
      }
    } else if ('.+^$()|]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', '.next', '.turbo', 'coverage']);

async function walk(root: string, onFile: (relPath: string) => boolean): Promise<void> {
  // onFile returns false to signal "stop walking" (limit reached).
  const stack: string[] = ['.'];
  while (stack.length > 0) {
    const rel = stack.pop() as string;
    const abs = rel === '.' ? root : path.join(root, rel);
    try {
      // Sort by name for deterministic traversal so "first N results" (e.g. grep's
      // candidate cap) are stable across runs rather than inode/readdir order.
      const entries = (await fs.readdir(abs, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      // Process files inline (already alphabetical), collect dirs, then push them in
      // reverse so the first-alphabetical dir is popped first despite the LIFO stack —
      // keeps cross-directory traversal alphabetical for grep's first-N candidate cap.
      const dirs: string[] = [];
      for (const e of entries) {
        const childRel = rel === '.' ? e.name : `${rel}/${e.name}`;
        if (e.isDirectory()) {
          if (IGNORED_DIRS.has(e.name)) continue;
          dirs.push(childRel);
        } else if (e.isFile()) {
          if (!onFile(childRel)) return;
        }
      }
      for (let k = dirs.length - 1; k >= 0; k--) stack.push(dirs[k]);
    } catch {
      continue;
    }
  }
}

const glob: AgentTool = {
  name: 'glob',
  description:
    'Find files in the workspace matching a glob pattern. Supports *, **, {a,b} brace expansion, and [abc] bracket expressions. Skips vcs/build directories.',
  parameters: {
    type: 'object',
    required: ['pattern'],
    properties: {
      pattern: { type: 'string', description: 'Glob pattern, e.g. "src/**/*.ts".' },
    },
  },
  async run(args, ctx) {
    try {
      const pattern = String(args.pattern ?? '').replace(/^[/\\]+/, '');
      if (!pattern) return fail('pattern is required');
      const matcher = globToRegExp(pattern);
      const matches: string[] = [];
      await walk(ctx.cwd, (rel) => {
        if (matcher.test(rel)) matches.push(rel);
        return matches.length < GLOB_MAX_RESULTS;
      });
      return ok({ matches, truncated: matches.length >= GLOB_MAX_RESULTS });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
};

const grep: AgentTool = {
  name: 'grep',
  description: 'Search workspace file contents for a regular expression. Returns matching file/line/text. Skips vcs/build directories.',
  parameters: {
    type: 'object',
    required: ['pattern'],
    properties: {
      pattern: { type: 'string', description: 'Regular expression to search for.' },
      pathGlob: { type: 'string', description: 'Optional glob to restrict which files are searched.' },
      ignoreCase: { type: 'boolean', description: 'Case-insensitive match.' },
    },
  },
  async run(args, ctx) {
    try {
      const pattern = String(args.pattern ?? '');
      if (!pattern) return fail('pattern is required');
      const flags = args.ignoreCase === true ? 'i' : '';
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch (e) {
        return fail(`invalid regex: ${e instanceof Error ? e.message : String(e)}`);
      }
      const pathMatcher = args.pathGlob ? globToRegExp(String(args.pathGlob).replace(/^[/\\]+/, '')) : null;

      // Collect candidate files first (cheap, no reads), then read each once.
      const files: string[] = [];
      await walk(ctx.cwd, (rel) => {
        if (!pathMatcher || pathMatcher.test(rel)) files.push(rel);
        // Stop walking once we have plenty of candidates: a single file can hold
        // many matches, so collect a generous multiple of the result cap rather
        // than traversing the entire tree on large workspaces.
        return files.length < GREP_MAX_RESULTS * 10;
      });

      const results: Array<{ file: string; line: number; text: string }> = [];
      let truncated = false;
      for (const rel of files) {
        if (results.length >= GREP_MAX_RESULTS) {
          truncated = true;
          break;
        }
        let content: string;
        try {
          content = await fs.readFile(path.join(ctx.cwd, rel), 'utf-8');
        } catch {
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({ file: rel, line: i + 1, text: lines[i].slice(0, 500) });
            if (results.length >= GREP_MAX_RESULTS) {
              truncated = true;
              break;
            }
          }
        }
      }
      return ok({ results, truncated });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
};

/** The default system tool set, operating on the agent's working directory. */
export function buildSystemTools(): AgentTool[] {
  return [bash, read, write, edit, ls, glob, grep];
}
