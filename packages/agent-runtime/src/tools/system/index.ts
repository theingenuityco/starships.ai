// The built-in toolset: `system.*`. The first (and in Phase 0, only) provider — the seam
// every other source (mcp, user bundles) will plug into the same way.
import type { ToolContext, ToolDescriptor, ToolResult, ToolsetProvider } from '../types';
import type { SystemTool } from './tool';
import { bashTool } from './bash';
import { readFileTool, writeFileTool, listDirTool } from './fs';
import { httpFetchTool } from './http';
import { toolSearchTool } from './tool-search';

const TOOLS: SystemTool[] = [toolSearchTool, bashTool, readFileTool, writeFileTool, listDirTool, httpFetchTool];

export class SystemProvider implements ToolsetProvider {
  readonly name = 'system';
  readonly source = 'system' as const;
  private readonly tools = new Map<string, SystemTool>(TOOLS.map((t) => [t.name, t]));

  async init(): Promise<ToolDescriptor[]> {
    return TOOLS.map((t) => ({
      fqn: `${this.name}.${t.name}`,
      name: t.name,
      toolset: this.name,
      description: t.description,
      schema: { kind: 'zod', schema: t.schema },
      sensitive: t.sensitive,
      capabilities: t.capabilities,
      residency: t.residency ?? 'resident',
    }));
  }

  async execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { output: `Unknown tool: ${this.name}.${name}`, error: true };
    // Validate against the authored Zod schema (throws -> caught by the runtime as an error).
    const parsed = tool.schema.parse(input);
    return { output: await tool.run(parsed, ctx) };
  }
}

export function buildSystemProvider(): SystemProvider {
  return new SystemProvider();
}
