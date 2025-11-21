import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Get Doc
 * Fetch a single documentation page by slug via the Starships HTTP API.
 */
export const docsGetDocTool: ToolParams = {
  name: 'Get Doc',
  slug: 'get-doc',
  description: `Fetch the raw markdown content for a documentation page by slug.

Inputs:
- slug: string (doc slug; nested slugs supported, e.g., "core-concepts/tools")

Output:
- { slug: string, title: string, content: string }

Behavior and limits:
- Read-only and idempotent
- Timeouts: prepare 3s, HTTP 5s
- Typical failures: missing baseUrl, invalid slug, not found (404), network errors`,
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Documentation slug to fetch (no .md/.mdx extension)' },
    },
    required: ['slug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate Input',
        description: 'Ensure slug is provided and correctly typed',
        parameters: {
          code: `
            async function main(ctx) {
              const slug = ctx.$input && typeof ctx.$input.slug === 'string' ? ctx.$input.slug.trim() : '';
              if (!slug) throw new Error('slug is required');
              return { slug };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'http_get_doc',
        type: 'http_request',
        name: 'Get Doc (Starships)',
        description: 'Fetch documentation page via Starships docs HTTP API',
        parameters: {
          method: 'GET',
          url: '{{ $runtimeConfig.BASE_URL }}/docs/{{ $lastOutputOf("validate")[0].json.slug }}',
          headers: {
            Authorization: 'Bearer {{ $runtimeConfig.AUTH_TOKEN }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract',
        type: 'code',
        name: 'Extract Payload',
        description: 'Return the connector payload',
        parameters: {
          code: `
            async function main(ctx) {
              const raw = ctx.$input;
              const payload = raw && typeof raw === 'object' && (raw as any).body !== undefined ? (raw as any).body : raw;
              if (payload && typeof payload === 'object' && (payload as any).data !== undefined) {
                return (payload as any).data;
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
          output: '{{ $lastOutputOf("extract")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate' },
      { ref: 'e2', from: 'validate', to: 'http_get_doc' },
      { ref: 'e3', from: 'http_get_doc', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const docsGetDocToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: docsGetDocTool.name,
  description: docsGetDocTool.description,
  parameters: docsGetDocTool.parameters,
  blueprint: docsGetDocTool.blueprint,

  slug: 'get-doc',
  version: '1.0.1',
  category: 'data',
  exampleUsage: '{ "slug": "core-concepts/tools" } // returns markdown content; env baseUrl inferred',
  requiresApiKey: false,
  configurationFields: [],
};
