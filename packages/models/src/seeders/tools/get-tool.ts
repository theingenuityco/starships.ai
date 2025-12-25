import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Get Tool
 * Get full tool details (including blueprint) by slug for the specified starship using the Starships HTTP API.
 */
export const toolGetTool: ToolParams = {
  name: 'Get Tool',
  slug: 'get-tool',
  description: `Get full details for a tool on the current starship by slug.

Inputs:
- slug: string (tool slug on this starship)

Output:
- Full tool model as returned by the server (includes blueprint)

Behavior and limits:
- Read-only and idempotent
- Timeouts: validation 2s, connector call handled server-side
- Typical failures: missing slug, connector/transport errors, tool not found`,
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Tool slug to fetch' },
    },
    required: ['slug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Validate slug and prepare relative URL for Starships connector',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
              const slug = input.slug;
              if (!slug || typeof slug !== 'string') {
                throw new Error('slug is required and must be a string');
              }
              return { slug };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'http_get',
        type: 'connector_action',
        name: 'Get Tool (Starships)',
        description: 'Fetch tool definition via Starships connector action',
        parameters: {
          connector: 'starships',
          action: 'get-tool',
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).slug }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract',
        type: 'code',
        name: 'Extract Payload',
        description: 'Return the connector payload body (preferring data when present)',
        parameters: {
          code: `
            async function main(ctx) {
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;
              if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
                return payload.data;
              }
              return payload;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("extract") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get' },
      { ref: 'e3', from: 'http_get', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const toolGetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolGetTool.name,
  description: toolGetTool.description,
  parameters: toolGetTool.parameters,
  blueprint: toolGetTool.blueprint,

  slug: 'get-tool',
  version: '1.0.2',
  category: 'automation',
  exampleUsage: '{ "slug": "calc" } // returns full tool model; connector infers starship context',
  requiresApiKey: false,
  configurationFields: [],
};
