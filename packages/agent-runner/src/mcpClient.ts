import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AgentDispatchModel, AgentConnectionStatus } from '@starships/protocol';

/** Shape returned by the server's `ok()` helper: text content holding JSON. */
type ToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean };

function parseToolResult<T>(result: unknown): T {
  const r = result as ToolResult;
  const text = r?.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Unexpected non-JSON tool response: ${text.slice(0, 200)}`);
  }
  if (r?.isError) {
    const msg = (parsed as { error?: string })?.error ?? 'tool returned an error';
    throw new Error(msg);
  }
  return parsed as T;
}

/**
 * Thin MCP client scoped to one agent token. Connects to the stateless Starship
 * MCP server (POST /mcp) with the token as a bearer header and exposes the
 * dispatch-loop tools the runner needs.
 */
export class StarshipMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly token: string
  ) {}

  async connect(): Promise<void> {
    if (this.client) return;
    const transport = new StreamableHTTPClientTransport(new URL(this.endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${this.token}` } },
    });
    const client = new Client({ name: 'starship-agent-runner', version: '0.0.0' });
    await client.connect(transport);
    this.client = client;
    this.transport = transport;
  }

  async close(): Promise<void> {
    try {
      await this.transport?.close();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.transport = null;
  }

  /** Reconnect from scratch (used to recover after a transport error). */
  async reconnect(): Promise<void> {
    await this.close();
    await this.connect();
  }

  private async call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.client) await this.connect();
    const result = await this.client!.callTool({ name, arguments: args });
    return parseToolResult<T>(result);
  }

  pullCommands(): Promise<AgentDispatchModel[]> {
    return this.call<AgentDispatchModel[]>('pull_commands');
  }

  ack(dispatchId: string): Promise<AgentDispatchModel> {
    return this.call<AgentDispatchModel>('ack_command', { dispatchId });
  }

  complete(dispatchId: string): Promise<AgentDispatchModel> {
    return this.call<AgentDispatchModel>('complete_command', { dispatchId });
  }

  reportStatus(status: AgentConnectionStatus, detail?: string): Promise<{ recorded: boolean }> {
    return this.call<{ recorded: boolean }>('report_status', { status, ...(detail ? { detail } : {}) });
  }

  postEvent(type: string, payload?: Record<string, unknown>, opts?: { dispatchId?: string; cardId?: string }): Promise<{ id: string }> {
    return this.call<{ id: string }>('post_event', {
      type,
      ...(payload ? { payload } : {}),
      ...(opts?.dispatchId ? { dispatchId: opts.dispatchId } : {}),
      ...(opts?.cardId ? { cardId: opts.cardId } : {}),
    });
  }
}
