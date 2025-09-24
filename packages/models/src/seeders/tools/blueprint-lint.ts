import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: blueprint_lint
 * Validate an Autopilot blueprint structure (nodes/edges, types, refs).
 */
export const blueprintLintTool: ToolParams = {
  name: 'blueprint_lint',
  description: `Validate an Autopilot blueprint’s basic structure and connectivity.

Inputs:
- blueprint: object with nodes[] and edges[] (or wrapper { blueprint })

Output:
- { ok: boolean, issues: string[], summary: { nodeCount: number, edgeCount: number, types: Record<string, number> } }

When to use:
- Before tool_create or tool_update
- During review to catch structural issues early`,
  parameters: {
    type: 'object',
    properties: {
      blueprint: {
        type: 'object',
        description: 'Blueprint object with nodes and edges',
        properties: {},
      },
    },
    required: ['blueprint'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'lint',
        type: 'code',
        name: 'Lint Blueprint',
        description: 'Run structural validations',
        parameters: {
          code: `
            function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

            // Accept either { blueprint } wrapper or direct blueprint
            const candidate = (input && typeof input === 'object' && 'blueprint' in input) ? input.blueprint : input;
            const issues = [];

            // If it's not an object, do not throw - return a structured lint result
            if (!isObject(candidate)) {
              return {
                ok: false,
                issues: ['Invalid blueprint: must be an object with nodes[] and edges[]'],
                summary: { nodeCount: 0, edgeCount: 0, types: {} }
              };
            }

            const bp = candidate;

            // Normalize missing arrays to empty while recording issues
            if (!Array.isArray(bp.nodes)) {
              issues.push('Invalid blueprint: nodes must be an array');
              bp.nodes = [];
            }
            if (!Array.isArray(bp.edges)) {
              issues.push('Invalid blueprint: edges must be an array');
              bp.edges = [];
            }

            const nodes = bp.nodes;
            const edges = bp.edges;

            // Validate node refs and types
            const allowedTypes = [
              'start','end','agent','workflow','http_request','llm','user_prompt',
              'conditional','transform','mutate','tool','code'
            ];
            const seenRefs = new Set();
            for (const n of nodes) {
              if (!n || typeof n !== 'object') {
                issues.push('Node entry must be an object');
                continue;
              }
              if (!n.ref || typeof n.ref !== 'string') {
                issues.push('Node missing valid "ref"');
              } else {
                if (seenRefs.has(n.ref)) issues.push(\`Duplicate node ref: \${n.ref}\`);
                seenRefs.add(n.ref);
              }

              if (!n.type || typeof n.type !== 'string') {
                issues.push(\`\${n.ref ?? '?'} missing "type"\`);
              } else if (!allowedTypes.includes(n.type)) {
                issues.push(\`Unsupported node type "\${n.type}" at \${n.ref}\`);
              }
            }

            // Start/End presence
            const hasStart = nodes.some((n) => n && n.type === 'start');
            const hasEnd = nodes.some((n) => n && n.type === 'end');
            if (!hasStart) issues.push('Missing start node');
            if (!hasEnd) issues.push('Missing end node');

            // Validate edges reference existing nodes
            for (const e of edges) {
              if (!e || typeof e !== 'object') {
                issues.push('Edge entry must be an object');
                continue;
              }
              if (!e.from || !e.to) {
                issues.push(\`\${e.ref ?? '?'} missing "from" or "to"\`);
                continue;
              }
              if (!seenRefs.has(e.from)) issues.push(\`\${e.ref ?? '?'} "from" references unknown node: \${e.from}\`);
              if (!seenRefs.has(e.to)) issues.push(\`\${e.ref ?? '?'} "to" references unknown node: \${e.to}\`);
            }

            // Basic summary
            const typeCounts = nodes.reduce((acc, n) => {
              const t = n?.type ?? 'unknown';
              acc[t] = (acc[t] || 0) + 1;
              return acc;
            }, {});

            return {
              ok: issues.length === 0,
              issues,
              summary: {
                nodeCount: nodes.length,
                edgeCount: edges.length,
                types: typeCounts
              }
            };
          `,
          timeout: 4000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ $lastOutputOf("lint")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'lint' },
      { ref: 'e2', from: 'lint', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: blueprint_lint
 */
export const blueprintLintToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintLintTool.name,
  description: blueprintLintTool.description,
  parameters: blueprintLintTool.parameters,
  blueprint: blueprintLintTool.blueprint,

  slug: 'blueprint-lint',
  category: 'automation',
  exampleUsage: '{ "blueprint": { "nodes": [...], "edges": [...] } } // returns { ok, issues, summary }',
  requiresApiKey: false,
  configurationFields: [],
};
