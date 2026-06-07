// Phase 3: expose the registry AS an MCP server.
//
// The inverse of the mcp provider. Instead of consuming someone else's MCP server, we serve
// our own toolsets (system + any loaded user bundles) over MCP so external agent runtimes
// (claude-code, codex, ...) can call Starship's tools. Because every ToolDescriptor is
// already JSON-Schema-shaped (Zod is converted here), this is a thin adapter over the registry.
//
// Deferral does not apply on this side: the consuming runtime owns its own context budget, so
// we list every tool fully. The meta-tool system.tool_search is omitted — it only makes sense
// inside our own loop.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry, toWireName } from '../registry';
import type { ToolContext, ToolDescriptor } from '../types';

// Cast to a plain signature: zodToJsonSchema's generic return type triggers TS2589 (excessively
// deep) on our ZodTypeAny inputs. We only need a JSON Schema object back.
const zodToJson = zodToJsonSchema as (schema: unknown) => Record<string, unknown>;

/** JSON Schema for a descriptor, converting Zod-authored schemas on the way out. */
function jsonSchemaOf(d: ToolDescriptor): Record<string, unknown> {
  if (d.schema.kind === 'json') return d.schema.schema;
  return zodToJson(d.schema.schema);
}

/**
 * Build an MCP Server backed by `registry`. `getCtx` supplies the workspace + abort signal for
 * each call (the host decides how those are scoped). Connect the returned server to any
 * transport (stdio for a spawned server, HTTP for a hosted one).
 */
export function createToolsetMcpServer(registry: ToolRegistry, getCtx: () => ToolContext): Server {
  const server = new Server({ name: 'starship-toolsets', version: '0.0.0' }, { capabilities: { tools: {} } });
  const exposed = registry.all().filter((d) => d.name !== 'tool_search');

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: exposed.map((d) => ({
      name: toWireName(d.fqn),
      description: d.description,
      inputSchema: jsonSchemaOf(d),
      annotations: { readOnlyHint: !d.sensitive },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const entry = registry.resolveWire(req.params.name);
    if (!entry) {
      return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
    }
    const { output, error } = await registry.execute(entry.descriptor.fqn, req.params.arguments ?? {}, getCtx());
    return { content: [{ type: 'text', text: output }], isError: Boolean(error) };
  });

  return server;
}
