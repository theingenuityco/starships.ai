// MCP toolset provider: a connected Model Context Protocol server is a toolset.
//
// init() connects (stdio for a spawned server, Streamable HTTP for a URL) and lists the
// server's tools; execute() routes a call through tools/call; dispose() closes the
// connection. Tools are JSON-Schema native, so they map straight onto ToolDescriptor with
// no conversion. MCP servers can expose many tools, so every tool here is `deferred` — it
// rides the catalog and is pulled into context on demand via system.tool_search.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { clip } from '../shared';
import type { Capability, ToolDescriptor, ToolResult, ToolsetProvider } from '../types';
import type { McpServerConfig } from '../../types';

interface McpToolMeta {
  description: string;
  inputSchema: Record<string, unknown>;
  sensitive: boolean;
}

/** Shape of one content block in a tools/call result we know how to render. */
interface ContentBlock {
  type: string;
  text?: string;
}

export class McpProvider implements ToolsetProvider {
  readonly source = 'mcp' as const;
  private client?: Client;
  private readonly tools = new Map<string, McpToolMeta>();

  constructor(
    readonly name: string,
    private readonly config: McpServerConfig
  ) {}

  private buildTransport(): Transport {
    if (this.config.url) {
      const url = new URL(this.config.url);
      // Prefer Streamable HTTP (current spec); SSE is the legacy fallback for older servers.
      return /\/sse\/?$/.test(url.pathname) ? new SSEClientTransport(url) : new StreamableHTTPClientTransport(url);
    }
    if (!this.config.command) {
      throw new Error(`MCP server "${this.name}" needs either a command or a url`);
    }
    return new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env,
      cwd: this.config.cwd,
    });
  }

  async init(): Promise<ToolDescriptor[]> {
    const client = new Client({ name: 'starship-agent-runtime', version: '0.0.0' }, { capabilities: {} });
    await client.connect(this.buildTransport());
    this.client = client;

    const { tools } = await client.listTools();
    const descriptors: ToolDescriptor[] = [];
    for (const t of tools) {
      // readOnlyHint => safe; anything else touching the outside world is gated like a write.
      const sensitive = t.annotations?.readOnlyHint !== true;
      const description = t.description ?? `${t.name} (via ${this.name})`;
      const inputSchema = (t.inputSchema as Record<string, unknown>) ?? { type: 'object' };
      this.tools.set(t.name, { description, inputSchema, sensitive });
      const capabilities: Capability[] = this.config.url ? ['network'] : ['network', 'exec'];
      descriptors.push({
        fqn: `${this.name}.${t.name}`,
        name: t.name,
        toolset: this.name,
        description,
        schema: { kind: 'json', schema: inputSchema },
        sensitive,
        capabilities,
        residency: 'deferred',
      });
    }
    return descriptors;
  }

  async execute(name: string, input: unknown): Promise<ToolResult> {
    if (!this.client) return { output: `MCP server "${this.name}" is not connected.`, error: true };
    const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const res = await this.client.callTool({ name, arguments: args });
    const blocks = (res.content as ContentBlock[] | undefined) ?? [];
    const text = blocks
      .map((b) => (b.type === 'text' ? (b.text ?? '') : `[${b.type} content]`))
      .join('\n')
      .trim();
    return { output: clip(text || '(no content)'), error: res.isError === true };
  }

  async dispose(): Promise<void> {
    await this.client?.close().catch(() => {});
    this.client = undefined;
  }
}

export function buildMcpProvider(name: string, config: McpServerConfig): McpProvider {
  return new McpProvider(name, config);
}
