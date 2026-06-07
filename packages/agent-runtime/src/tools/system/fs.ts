import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { clip, resolveInWorkspace } from '../shared';
import type { SystemTool } from './tool';

export const readFileTool: SystemTool = {
  name: 'read_file',
  description: 'Read a UTF-8 text file relative to the workspace root.',
  schema: z.object({ path: z.string().describe('Path relative to the workspace root.') }),
  sensitive: false,
  capabilities: ['fs:read'],
  run: async (input, ctx) => {
    const abs = await resolveInWorkspace(ctx.workspace, (input as { path: string }).path);
    return clip(await readFile(abs, 'utf8'));
  },
};

export const writeFileTool: SystemTool = {
  name: 'write_file',
  description: 'Write (creating or overwriting) a UTF-8 text file relative to the workspace root.',
  schema: z.object({
    path: z.string().describe('Path relative to the workspace root.'),
    content: z.string().describe('Full file contents to write.'),
  }),
  sensitive: true,
  capabilities: ['fs:workspace'],
  run: async (input, ctx) => {
    const { path: p, content } = input as { path: string; content: string };
    const abs = await resolveInWorkspace(ctx.workspace, p);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
    return `Wrote ${content.length} bytes to ${p}`;
  },
};

export const listDirTool: SystemTool = {
  name: 'list_dir',
  description: 'List entries in a directory relative to the workspace root.',
  schema: z.object({ path: z.string().default('.').describe('Directory relative to the workspace root.') }),
  sensitive: false,
  capabilities: ['fs:read'],
  run: async (input, ctx) => {
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
};
