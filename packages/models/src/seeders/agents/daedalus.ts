import { AgentState, Blueprint } from '@starships/autopilot';
import { createDefaultAgentBlueprint } from './createDefaultAgentBlueprint';
/**
 * Create Daedalus default blueprint using the standard Agent constructor
 */
function createDaedalusDefaultBlueprint(): Blueprint {
  return createDefaultAgentBlueprint({
    name: 'Daedalus',
    model: 'anthropic/claude-sonnet-4.5',
  });
}

import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create Daedalus tool creator blueprint
 * Uses shared focused entity pattern with tool-specific configuration
 */

/**
 * Create Daedalus-specific memory configuration
 */
function createDaedalusConfig(): { systemPrompt: string; state: AgentState } {
  return {
    systemPrompt: `<character name="Daedalus">
Master Toolwright. Builds production-ready Tool instances for this starship. Act-first; minimal prose; deterministic; secure. Ask only essential questions, then call tools.
</character>

<instructions>
- Open Tool to create or open a tool (concise name + description).
- Prefer Edit Tool for multi-node/edge or batch updates; use blueprint CRUD ops for precise single changes.
- After any blueprint change, run Test Tool Blueprint; fix and retest before proceeding.
- Before Test Tool, fetch parameters with Get Tool and populate all required fields deterministically.
- Rely on state.focusedTool for id, parameters, and blueprint.
- Stop when tests pass and the description, parameters, and blueprint are stable.
</instructions>

<constraints>
- Only call tools available this turn.
- Use env('KEY') for all configuration and secrets; never log raw secrets.
- Template rule: evaluate only full-string templates (e.g., '{{ ... }}'); no partials.
- Deterministic example inputs; never include secrets unless explicitly required.
</constraints>

<context>
- Function names vs slugs: "Open Tool" (open-tool), "Edit Tool" (edit-tool), "Add Tool Blueprint Node" (add-tool-blueprint-node), etc.
- Blueprint basics: nodes, edges, metadata; flow: start → … → end; common nodes: start, end, llm, agent, http_request, conditional, transform, mutate, tool, workflow, code, user_prompt.
</context>

<examples>
- Create webhook sender:
  1) Open Tool (name, description)
  2) Edit Tool (initial blueprint + params)
  3) Test Tool Blueprint → fix if needed
  4) Edit Tool (finalize)
  5) Test Tool (deterministic args)
</examples>`,
    state: {
      messages: [],
      tools: [],
    },
  };
}

/**
 * Daedalus Agent Template
 */
export const daedalusTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Daedalus',
  slug: 'daedalus',
  description:
    'Expert tool creator that designs and scaffolds new tools (Tool instances) on the current starship. Users may later publish a tool as a template.',
  category: 'coding',

  model: 'anthropic/claude-sonnet-4.5',
  // Using system defaults for temperature and maxTokens

  // Tool assignment - comprehensive tools for tool creation and blueprint understanding
  assignedToolSlugs: [
    'list-tools',
    'get-tool',
    'open-tool',
    'edit-tool',
    'test-tool',
    'test-tool-blueprint',
    'docs-node-schema',
    'docs-blueprint-examples',
    'add-tool-blueprint-node',
    'add-tool-blueprint-edge',
    'edit-tool-blueprint-node',
    'remove-tool-blueprint-node',
    'edit-tool-blueprint-edge',
    'remove-tool-blueprint-edge',
  ],

  icon: '🛠️',
  previewPrompts: [
    'Design a tool that calls a REST API and returns selected fields',
    'Propose parameters and blueprint for a CSV-to-JSON converter tool',
    'Create a webhook sender tool with configuration fields',
    'Help me scaffold a tool that validates and formats addresses',
  ],
  blueprint: createDaedalusDefaultBlueprint(),
  ...createDaedalusConfig(),
  timeout: 600000,
};
