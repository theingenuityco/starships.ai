import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Get Doc
 * Fetch a single documentation page by slug via the Starships HTTP API.
 */
export const docsGetDocTool: ToolParams = {
  name: 'Get Doc',
  slug: 'get-doc',
  description:
    'Fetch the raw markdown content for a Starships documentation page by slug (nested slugs supported, no extension). Returns { slug, title, content }.',
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
              const input = ctx.input || {};
              const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
              if (!slug) throw new Error('slug is required');
              return { slug };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'http_get_doc',
        type: 'connector_action',
        name: 'Get Doc (Starships)',
        description: 'Fetch documentation page via Starships docs HTTP API',
        parameters: {
          connector: 'starships',
          action: 'get-doc',
          failOnNon2xx: true,
          args: {
            slug: '{{ (lastOutputOf("validate") || {}).slug }}',
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
  version: '1.0.3',
  category: 'data',
  exampleUsage: '{ "slug": "core-concepts/tools" } // returns markdown content; env baseUrl inferred',
  requiresApiKey: false,
  configurationFields: [],
};
