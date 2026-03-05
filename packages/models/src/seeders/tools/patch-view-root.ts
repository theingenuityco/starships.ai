import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Patch View Root
 * Applies RFC6902 JSON Patch ops to the persisted structure-only view root.
 */
export const patchViewRootTool: ToolParams = {
  name: 'Patch View Root',
  slug: 'patch-view-root',
  description:
    'Apply JSON Patch operations to a view root (structure-only: id + children). Use this to add/move/remove nodes without resending the entire widget tree.',
  parameters: {
    type: 'object',
    properties: {
      viewId: { type: 'string', description: 'View id' },
      patch: { type: 'array', description: 'RFC6902 patch ops (array)' },
    },
    required: ['viewId', 'patch'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate viewId + patch',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const viewId = typeof input.viewId === 'string' ? input.viewId.trim() : '';
              const patch = Array.isArray(input.patch) ? input.patch : null;
              if (!viewId) throw new Error('viewId is required');
              if (!patch || patch.length === 0) throw new Error('patch is required');
              return { viewId, patch };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'patch_root',
        type: 'connector_action',
        name: 'Patch View Root (Starships)',
        description: 'Persist a structure-only root patch',
        parameters: {
          connector: 'starships',
          action: 'patch-view-root',
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
      { ref: 'e2', from: 'validate_input', to: 'patch_root' },
      { ref: 'e3', from: 'patch_root', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const patchViewRootToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: patchViewRootTool.name,
  description: patchViewRootTool.description,
  parameters: patchViewRootTool.parameters,
  blueprint: patchViewRootTool.blueprint,
  slug: patchViewRootTool.slug,
  version: '1.0.0',
  category: 'utility',
  exampleUsage: '{ "viewId": "view_123", "patch": [{ "op": "add", "path": "/children/0", "value": { "id": "chart" } }] }',
  requiresApiKey: false,
  configurationFields: [],
};

