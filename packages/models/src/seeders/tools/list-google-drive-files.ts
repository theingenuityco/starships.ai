import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: List Google Drive Files (TEST / MOCK)
 *
 * Mock tool for testing required_connector_providers and "Connect these connectors" UX.
 * Uses the google_drive connector. Requires Google Drive to be connected for execution.
 */
export const listGoogleDriveFilesTool: ToolParams = {
  name: 'List Google Drive Files',
  slug: 'list-google-drive-files',
  description:
    'List files from the user\'s Google Drive. Requires Google Drive connector to be connected. (Test tool for required connectors UX)',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of files to return (1-100).' },
      query: { type: 'string', description: 'Optional search query to filter files.' },
    },
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Payload',
        description: 'Normalize input for connector',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
              const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(input.limit, 100) : 20;
              const query = typeof input.query === 'string' ? input.query : '';
              return { limit, q: query || undefined };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'drive_list',
        type: 'connector_action',
        name: 'List Google Drive Files',
        description: 'List files via Google Drive connector',
        parameters: {
          connector: 'google_drive',
          action: 'list-files',
          args: '{{ lastOutputOf("prepare") }}',
          timeout: 10000,
        },
      },
      {
        ref: 'extract',
        type: 'code',
        name: 'Extract Payload',
        description: 'Return connector response',
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
      { ref: 'e2', from: 'prepare', to: 'drive_list' },
      { ref: 'e3', from: 'drive_list', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const listGoogleDriveFilesToolTemplate: Omit<
  ToolTemplateModel,
  'id' | 'createdAt' | 'updatedAt' | 'usageCount'
> = {
  name: listGoogleDriveFilesTool.name,
  description: listGoogleDriveFilesTool.description,
  parameters: listGoogleDriveFilesTool.parameters,
  blueprint: listGoogleDriveFilesTool.blueprint,
  slug: 'list-google-drive-files',
  version: '1.0.0',
  category: 'data',
  exampleUsage: '{ "limit": 10, "query": "documents" }',
  requiresApiKey: false,
  configurationFields: [],
};
