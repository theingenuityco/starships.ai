// Parsing + validation of a user toolset bundle's `toolset.json` manifest.
//
// A bundle is a local directory:
//   <dir>/toolset.json        the manifest below
//   <dir>/tools/*.sh|py|...   process-runtime tool scripts (any language)
//   <dir>/index.js            node-runtime entry module (compiled JS)
import { z } from 'zod';

export const ToolManifestSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** JSON Schema for the tool's input. Defaults to an open object. */
  input: z.record(z.unknown()).default({ type: 'object' }),
  sensitive: z.boolean().default(false),
  capabilities: z.array(z.string()).default([]),
  /** process runtime: argv to spawn. command[0] is resolved relative to the bundle dir. */
  run: z.object({ command: z.array(z.string()).min(1) }).optional(),
  /** node runtime: exported handler name (defaults to the tool name). */
  handler: z.string().optional(),
});

export const ManifestSchema = z.object({
  name: z.string(),
  version: z.string().default('0.0.0'),
  /** 'process' (default, out-of-process, any language) or 'node' (in-process, trusted). */
  runtime: z.enum(['process', 'node']).default('process'),
  /** node runtime: path (relative to the bundle dir) of the compiled entry module. */
  entry: z.string().optional(),
  tools: z.array(ToolManifestSchema).min(1),
});

export type ToolManifest = z.infer<typeof ToolManifestSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
