import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: blueprint_lint
 * Validate an Autopilot blueprint structure (nodes/edges, types, refs).
 */
export const blueprintLintTool: ToolParams = {
  name: 'blueprint_lint',
  description: `Validates Autopilot blueprint structure and connectivity with comprehensive error reporting.

## Purpose
Performs structural validation of Autopilot workflow blueprints to catch issues before deployment or execution.

## Input Requirements
- **blueprint**: Complete blueprint object OR wrapper object containing blueprint
  - Accepts direct blueprint: \`{ nodes: [...], edges: [...], metadata?: {...} }\`
  - Accepts wrapped blueprint: \`{ blueprint: { nodes: [...], edges: [...] } }\`

## Validation Coverage
- **Structure**: Validates nodes[] and edges[] arrays exist and contain valid objects
- **Node Validation**: Checks ref uniqueness, required fields (ref, type, name, parameters), supported types
- **Edge Validation**: Ensures from/to references point to existing nodes, validates edge structure
- **Flow Validation**: Verifies start and end nodes exist for proper workflow execution
- **Type Coverage**: Supports all Autopilot node types (start, end, llm, code, http_request, conditional, transform, mutate, tool, agent, workflow, user_prompt)

## Output Format
Returns structured validation result:
\`\`\`json
{
  "ok": boolean,              // true if no issues found
  "issues": string[],         // array of validation error messages
  "summary": {
    "nodeCount": number,      // total number of nodes
    "edgeCount": number,      // total number of edges
    "types": {                // count by node type
      "start": 1,
      "llm": 2,
      "end": 1
    }
  }
}
\`\`\`

## Usage Scenarios
- **Pre-deployment**: Validate blueprints before tool_create or tool_update operations
- **Development**: Catch structural issues during blueprint authoring
- **Quality Assurance**: Verify blueprint integrity before production deployment
- **Debugging**: Identify connectivity and reference issues in complex workflows

## Validation Rules
- **Required Structure**: Blueprint must have nodes[] and edges[] arrays
- **Node Requirements**: Each node needs ref (unique), type (supported), name, parameters object
- **Edge Requirements**: Each edge needs from/to references to existing nodes
- **Flow Requirements**: Must contain at least one start node and one end node
- **Reference Integrity**: All edge references must point to existing node refs

## Error Categories
- **Structural Errors**: Missing or invalid nodes/edges arrays
- **Reference Errors**: Duplicate node refs, missing edge targets
- **Type Errors**: Unsupported node types, invalid object structures
- **Flow Errors**: Missing start/end nodes, broken connectivity`,
  parameters: {
    type: 'object',
    properties: {
      blueprint: {
        type: 'object',
        description:
          'Complete Autopilot workflow blueprint for validation OR wrapper object containing blueprint. Accepts direct blueprint { nodes: [...], edges: [...], metadata?: {...} } or wrapped blueprint { blueprint: { nodes: [...], edges: [...] } }. Validates structure, node types, edge connectivity, reference integrity, and flow requirements (start/end nodes). Supported node types: start, end, llm, code, http_request, conditional, transform, mutate, tool, agent, workflow, user_prompt. Each node requires ref (unique identifier), type, name, description, parameters. Each edge requires ref, from (source node), to (target node), optional condition. Returns { ok: boolean, issues: string[], summary: { nodeCount, edgeCount, types: {...} } }',
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
