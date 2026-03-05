import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Update View Widget
 * Upserts a single view widget node (view_widgets row). Props are merged on update.
 */
export const updateViewWidgetTool: ToolParams = {
  name: 'Update View Widget',
  slug: 'update-view-widget',
  description:
    'Upsert a single view widget node within a view (props are merged). Use this to update one widget without resending the entire view root.',
  parameters: {
    type: 'object',
    properties: {
      viewId: { type: 'string', description: 'View id' },
      nodeId: { type: 'string', description: 'Node id within the view tree (e.g. "root" or a nanoid)' },
      type: { type: 'string', description: 'Widget type (registry key), optional' },
      props: { type: 'object', description: 'Props patch object to merge into existing props (optional)' },
      bindings: { type: ['object', 'null'], description: 'Bindings object (optional; null clears)' },
      handlers: { type: ['object', 'null'], description: 'Handlers object (optional; null clears)' },
      permissions: { type: ['object', 'null'], description: 'Permissions object (optional; null clears)' },
    },
    required: ['viewId', 'nodeId'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate viewId + nodeId; normalize payload',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const viewId = typeof input.viewId === 'string' ? input.viewId.trim() : '';
              const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
              if (!viewId) throw new Error('viewId is required');
              if (!nodeId) throw new Error('nodeId is required');
              const out = { viewId, nodeId };
              if (typeof input.type === 'string' && input.type.trim()) out.type = input.type.trim();
              if (input.props && typeof input.props === 'object') out.props = input.props;
              if (Object.prototype.hasOwnProperty.call(input, 'bindings')) out.bindings = input.bindings;
              if (Object.prototype.hasOwnProperty.call(input, 'handlers')) out.handlers = input.handlers;
              if (Object.prototype.hasOwnProperty.call(input, 'permissions')) out.permissions = input.permissions;
              return out;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'update_node',
        type: 'connector_action',
        name: 'Update View Widget (Starships)',
        description: 'Persist a single view widget node',
        parameters: {
          connector: 'starships',
          action: 'update-view-widget',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("validate_input") }}',
          timeout: 10000,
        },
      },
      {
        ref: 'extract',
        type: 'code',
        name: 'Extract Payload',
        description: 'Return connector payload (prefer data when present)',
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
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ lastOutputOf("extract") }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate_input' },
      { ref: 'e2', from: 'validate_input', to: 'update_node' },
      { ref: 'e3', from: 'update_node', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const updateViewWidgetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: updateViewWidgetTool.name,
  description: updateViewWidgetTool.description,
  parameters: updateViewWidgetTool.parameters,
  blueprint: updateViewWidgetTool.blueprint,
  slug: updateViewWidgetTool.slug,
  version: '1.0.0',
  category: 'utility',
  exampleUsage: '{ "viewId": "view_123", "nodeId": "chart", "props": { "title": "Updated" } }',
  requiresApiKey: false,
  configurationFields: [],
};

