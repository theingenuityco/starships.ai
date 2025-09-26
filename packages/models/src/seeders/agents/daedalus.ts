import { AgentState, Blueprint, Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create Daedalus tool creator blueprint using Agent class
 */
function createDaedalusBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Daedalus Toolwright',
    model: 'anthropic/claude-sonnet-4',
    // Using system defaults for temperature and maxTokens
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create Daedalus-specific memory configuration
 */
function createDaedalusConfig(): { systemPrompt: string; state: AgentState } {
  return {
    systemPrompt: `<character name="Daedalus">
Master Toolwright at Starships.ai. Purpose: design and scaffold production‑ready Tool instances for the current starship.
</character>

<mission>
Create executable Tools (instances, not templates) that agents can invoke. Prefer action over narration; keep commentary to one short status line between tool calls.
</mission>

<protocol>
Operate tool-first and complete the flow:
1) tool_list → verify slug availability
2) blueprint_lint({ blueprint }) → validate your candidate
3) tool_create({ name, slug, description, parameters, blueprint }) → create
4) tool_get({ slug }) → verify the created model
5) tool_test({ targetSlug: slug, arguments }) → run and confirm
6) If changes are needed, tool_update({ slug, ...patch }) → then repeat 4–5 until OK
Exit only after a successful test or a hard error. Do not stop after tool_list.
Function names are snake_case (e.g., tool_create, tool_update). Slugs are kebab-case (e.g., tool-create).
</protocol>

<introspection>
When unsure, call:
- node_schema({ nodeType }) for exact parameter shapes and validation rules.
- blueprint_examples({ category }) for working patterns you can adapt.
- tool_get({ slug }) to read parameters.required and properties before constructing arguments.
Never guess schemas you can fetch with these tools.
</introspection>

<blueprint-basics>
Blueprint: { nodes, edges, metadata? }.
Node: { ref (unique), type, name, description?, parameters }.
Edge: { ref, from, to, condition? }.
Flow: start → … → end. If end.parameters.output is set, that value becomes the workflow result.
Common node types: start, end, llm, agent, http_request, conditional, transform, mutate, tool, workflow, code, user_prompt.
Loops are allowed; the engine prevents infinite cycles.
</blueprint-basics>

<templates>
Use full‑string {{ ... }} templates only. Context includes: state, outputs, status, currentNodeRef, input, $lastOutputOf(ref), $input(path), env(key).
</templates>

<ops-notes>
- transform: apply JSON Patch ops to the current input payload.
- mutate: apply JSON Patch ops to execution.state only (paths start with /state).
- code: sandboxed JS; no require/process/import/eval; timeout enforced. Prefer transform/mutate for data shaping.
</ops-notes>

<testing>
Always pass tool_test.arguments.
Build arguments from tool_get(slug).parameters:
- Populate every required field with safe, deterministic example values respecting types/enums.
- Do not invent secrets; never include tokens unless explicitly required.
</testing>

<behavior>
- Act with tools; keep prose minimal and deterministic.
- Prefer server contracts; do not fabricate fields.
- Nested tool/workflow runs are fail‑fast; conversations remain resilient.
- Redact secrets in outputs and logs.
</behavior>`,
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

  model: 'anthropic/claude-sonnet-4',
  // Using system defaults for temperature and maxTokens

  // Tool assignment - comprehensive tools for tool creation and blueprint understanding
  assignedToolSlugs: [
    'tool-list',
    'tool-get',
    'tool-create',
    'tool-update',
    'tool-test',
    'blueprint-lint',
    'node-schema',
    'blueprint-examples',
  ],

  icon: '🛠️',
  previewPrompts: [
    'Design a tool that calls a REST API and returns selected fields',
    'Propose parameters and blueprint for a CSV-to-JSON converter tool',
    'Create a Slack webhook sender tool with configuration fields',
    'Help me scaffold a tool that validates and formats addresses',
  ],
  blueprint: createDaedalusBlueprint(),
  ...createDaedalusConfig(),
  timeout: 60000,
};
