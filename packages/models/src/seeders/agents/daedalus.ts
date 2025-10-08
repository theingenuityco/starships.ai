import { AgentState, Blueprint, BlueprintBuilder } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create Daedalus tool creator blueprint
 * Blueprint structure matches the default agent blueprint with tool execution support
 */
function createDaedalusBlueprint(): Blueprint {
  const builder = new BlueprintBuilder();

  // Define refs upfront for nodes used in template strings
  const llmNodeRef = 'ai_assistant';
  const toolNodeRef = 'execute_tool';

  // Add nodes and capture their refs
  const startRef = builder.addNode({
    type: 'start',
    name: 'Start',
    description: 'Start node',
    parameters: {},
  });

  const endRef = builder.addNode({
    type: 'end',
    name: 'End',
    description: 'End node',
    parameters: {},
  });

  // LLM node with state-driven tools - use predefined ref
  builder.addNode({
    type: 'llm',
    name: 'AI Assistant',
    description: 'AI model with state-driven tool support',
    ref: llmNodeRef,
    parameters: {
      model: 'anthropic/claude-sonnet-4.5',
      messages: '{{ state.messages }}',
      tools: '{{ state.tools }}',
      mutations: [
        {
          operation: 'add' as const,
          path: '/state/messages/-',
          value: `{{ (() => {
            const msg = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message ?? {};
            const content = typeof msg.content === "string" ? msg.content : "";
            const calls = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
            const reasoning = typeof msg.reasoning === "string" ? msg.reasoning : undefined;
            if (calls.length > 0) {
              const toolCalls = calls.map(tc => ({
                id: tc?.id ?? "",
                type: "function",
                function: {
                  name: tc?.function?.name ?? "",
                  arguments: (() => {
                    try {
                      const a = tc?.function?.arguments;
                      if (typeof a === "string") { try { return JSON.parse(a); } catch { return {}; } }
                      return a ?? {};
                    } catch { return {}; }
                  })()
                }
              }));
              return { role: "assistant", content, ...(reasoning ? { reasoning } : {}), toolCalls };
            }
            return { role: "assistant", content, ...(reasoning ? { reasoning } : {}) };
          })() }}`,
        },
      ],
    },
  });

  // Conditional node for tool call detection
  const conditionalNodeRef = builder.addNode({
    type: 'conditional',
    name: 'Check Tool Calls',
    description: 'Check if LLM made any tool calls or needs to continue due to length finishReason',
    parameters: {
      condition:
        '{{(() => { const last = $input(); const fr = last?.choices?.[0]?.finishReason; if (fr==="length") return "continue"; if (fr==="tool_calls") return "call_tool"; const calls = last?.choices?.[0]?.message?.toolCalls; return Array.isArray(calls) && calls.length > 0 ? "call_tool" : "complete"; })()}}',
    },
  });

  // Prepare arguments for Tool - capture ref for edge connections
  const argsNodeRef = builder.addNode({
    type: 'code',
    name: 'Prepare Tool Args',
    description: 'Materialize arguments into a plain object for Tool input',
    parameters: {
      code: `
        const last = $lastOutputOf("${llmNodeRef}")[0]?.json;
        let j = last?.choices?.[0]?.message?.toolCalls?.[0]?.function?.arguments;
        if (typeof j === 'string') { try { j = JSON.parse(j); } catch {} }
        if (j && typeof j === 'object') { return j; }
        throw new Error('Missing toolCall function.arguments');
      `,
      timeout: 3000,
    },
  });

  // Tool execution node - use predefined ref
  builder.addNode({
    type: 'tool',
    name: 'Execute Tool',
    description: 'Execute tool',
    ref: toolNodeRef,
    parameters: {
      name: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const slug = calls?.[0]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.name ?? (slug ?? ""); })() }}`,
      description: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const slug = calls?.[0]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.description ?? ("Tool '" + (slug ?? "unknown") + "' not found"); })() }}`,
      parameters: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const slug = calls?.[0]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.parameters ?? ({ type: "object", properties: {} }); })() }}`,
      blueprint: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const slug = calls?.[0]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.blueprint; })() }}`,
      toolCallId: `{{ $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls?.[0]?.id ?? "" }}`,
    },
  });

  // Mutate node to add tool result to state and update tools array for tool operations
  const toolResultNodeRef = builder.addNode({
    type: 'mutate',
    name: 'Add Tool Result',
    description: 'Add tool result message to conversation state and update tools array for tool operations',
    parameters: {
      mutations: [
        {
          operation: 'add' as const,
          path: '/state/messages/-',
          value: `{{ (() => {
            const toolCallId = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls?.[0]?.id ?? "";
            const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls;
            const toolSlug = calls?.[0]?.function?.name;
            const toolResult = $lastOutputOf("${toolNodeRef}")[0]?.json ?? {};
            
            // For tool-modifying operations, return minimal confirmation to reduce token bloat
            const toolModifyOps = [
              'tool-open', 'tool-edit',
              'tool-add-blueprint-node', 'tool-add-blueprint-edge',
              'tool-blueprint-edit-node', 'tool-blueprint-remove-node',
              'tool-blueprint-edit-edge', 'tool-blueprint-remove-edge'
            ];
            
            let content;
            if (toolModifyOps.includes(toolSlug)) {
              // Minimal response - full data is in state.focusedTool
              const status = toolResult.status || toolResult.body?.status || 200;
              const success = status >= 200 && status < 300;
              content = JSON.stringify({
                success: success,
                message: success ? 'Tool updated successfully' : 'Tool operation failed',
                slug: toolResult.body?.data?.slug || toolResult.body?.slug || 'unknown'
              });
            } else {
              // Full response for other tools
              content = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            }
            
            return {
              role: "tool",
              toolCallId: toolCallId,
              content: content
            };
          })() }}`,
        },
        {
          operation: 'replace' as const,
          path: '/state/focusedTool',
          value: `{{ (() => {
            const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls;
            const toolSlug = calls?.[0]?.function?.name;
            // Update focusedTool for any tool that modifies tool state
            const updateTools = [
              'tool-open', 'tool-edit',
              'tool-add-blueprint-node', 'tool-add-blueprint-edge',
              'tool-blueprint-edit-node', 'tool-blueprint-remove-node',
              'tool-blueprint-edit-edge', 'tool-blueprint-remove-edge'
            ];
            if (updateTools.includes(toolSlug)) {
              const httpResponse = $lastOutputOf("${toolNodeRef}")[0]?.json ?? {};
              const toolData = httpResponse.body?.data || httpResponse.body;
              if (!toolData || !toolData.name) return state.focusedTool || null;
              // Store complete tool details to minimize repetitive tool calls
              return {
                id: toolData.id,
                name: toolData.name,
                slug: toolData.slug,
                description: toolData.description || '',
                parameters: toolData.parameters || null,
                blueprint: toolData.blueprint || null,
                status: toolData.status || 'draft',
                starshipId: toolData.starshipId,
                templateId: toolData.templateId || null,
                createdAt: toolData.createdAt,
                updatedAt: toolData.updatedAt
              };
            }
            return null;
          })() }}`,
        },
      ],
    },
  });

  // Conditional node to check if focusedTool exists
  const checkFocusedToolRef = builder.addNode({
    type: 'conditional',
    name: 'Check Focused Tool',
    description: 'Check if a focusedTool exists to add context',
    parameters: {
      // Guard against duplicate context insertion:
      // - Only add when focusedTool is present AND messages[1] is not already the focused tool context.
      condition:
        '{{ (() => { try { const hasFT = !!(state.focusedTool && typeof state.focusedTool === "object" && Object.keys(state.focusedTool).length > 0); if (!hasFT) return "no_context"; const msgs = Array.isArray(state.messages) ? state.messages : []; const m1 = msgs[1]; const isCtx = m1 && m1.role === "system" && typeof m1.content === "string" && m1.content.includes("<focused-tool>"); return isCtx ? "no_context" : "add_context"; } catch { return "add_context"; } })() }}',
    },
  });

  // Mutate node to add focused tool context (only executed when focusedTool exists)
  const focusedToolContextRef = builder.addNode({
    type: 'mutate',
    name: 'Add Focused Tool Context',
    description: 'Add focused tool as system message',
    parameters: {
      mutations: [
        {
          operation: 'add' as const,
          path: '/state/messages/1',
          value: `{{ {
            role: 'system',
            content: \`<focused-tool>
id: \${state.focusedTool.id || 'N/A'}
name: \${state.focusedTool.name}
slug: \${state.focusedTool.slug}
description: \${state.focusedTool.description}
status: \${state.focusedTool.status || 'draft'}
parameters: \${state.focusedTool.parameters ? 'defined' : 'null'}
blueprint: \${state.focusedTool.blueprint ? 'defined' : 'null'}
</focused-tool>

<instructions>
The complete tool details are now available in state.focusedTool. All tool properties (id, parameters, blueprint, etc.) are accessible without additional API calls. The tool responses only confirm success - use state.focusedTool for actual data. Focus on completing this tool before proceeding with other tasks.
</instructions>\`
          } }}`,
        },
      ],
    },
  });

  // Connect all nodes
  return builder
    .addEdge(startRef, checkFocusedToolRef)
    .addEdge(checkFocusedToolRef, focusedToolContextRef, 'add_context')
    .addEdge(focusedToolContextRef, llmNodeRef)
    .addEdge(checkFocusedToolRef, llmNodeRef, 'no_context')
    .addEdge(llmNodeRef, conditionalNodeRef)
    .addEdge(conditionalNodeRef, llmNodeRef, 'continue')
    .addEdge(conditionalNodeRef, argsNodeRef, 'call_tool')
    .addEdge(argsNodeRef, toolNodeRef)
    .addEdge(toolNodeRef, toolResultNodeRef)
    .addEdge(toolResultNodeRef, checkFocusedToolRef) // Loop back to check for focusedTool after tool execution
    .addEdge(conditionalNodeRef, endRef, 'complete')
    .setMetadata('generatedBy', 'Daedalus seeder')
    .build();
}

/**
 * Create Daedalus-specific memory configuration
 */
function createDaedalusConfig(): { systemPrompt: string; state: AgentState } {
  return {
    systemPrompt: `<character name="Daedalus">
Master Toolwright at Starships.ai. Purpose: design and scaffold production-ready Tool instances for the current starship.
</character>

<mission>
Create executable Tools (instances, not templates) that agents can invoke. Prefer action over narration; keep commentary to one short status line between tool calls.
</mission>

<protocol>
Design tools collaboratively using the available toolset (List Tools, blueprint_lint, Open Tool, Get Tool, Test Tool, tool_open, tool_edit, tool-add-blueprint-node, tool-add-blueprint-edge, tool-blueprint-edit-node, tool-blueprint-remove-node, tool-blueprint-edit-edge, tool-blueprint-remove-edge).

Workflow:
1. Use "Open Tool" (with name and slug) to scaffold a draft (optional description)
2. Use "Add Tool Blueprint Node" to add individual nodes (start, llm, code, http_request, etc.)
3. Use "Add Tool Blueprint Edge" to connect nodes with proper workflow flow
4. Use "Edit Tool Blueprint Node" to refine node properties (name, parameters, etc.)
5. Use "Edit Tool Blueprint Edge" to adjust connections and conditions
6. Use blueprint_lint to validate the blueprint structure at any time
7. Use "Remove Tool Blueprint Node" or "Remove Tool Blueprint Edge" to clean up as needed
8. Use "Edit Tool" to complete the draft with final blueprint
9. Use Test Tool to validate the completed tool

Alternative Workflow for Existing Tools:
1. Use "Open Tool" to fetch and focus on an existing tool by slug
2. Use tool blueprint manipulation tools to modify incrementally (add/edit/remove nodes/edges)
3. Use blueprint_lint to validate changes at each step
4. Use "Edit Tool" to apply the final blueprint updates
5. Use Test Tool to validate changes

All tool manipulation commands (Open Tool, Edit Tool, and all blueprint CRUD operations) automatically update state.focusedTool with complete tool details. Tool call responses are minimal confirmations - always access complete tool data (id, parameters, blueprint, etc.) directly from state.focusedTool without additional API calls. The focused tool stays synchronized as you modify it. Draft tools (status='draft') are excluded from agent execution until activated.

Function names use their display name (e.g., "Open Tool", "Edit Tool", "Add Tool Blueprint Node"). Slugs are kebab-case (e.g., tool-open, tool-edit, tool-add-blueprint-node).
</protocol>

<introspection>
When unsure, call:
- node_schema({ nodeType }) for exact parameter shapes and validation rules.
- blueprint_examples({ category }) for working patterns you can adapt.
- Get Tool({ slug }) to read parameters.required and properties before constructing arguments.
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
Partial evaluation is forbidden. Only evaluate when the entire string equals a single {{ ... }} template.
- Incorrect: 'Hello {{ name }}'
- Correct: '{{ "Hello " + $input("name") }}'
- For URLs, headers, JSON bodies, and any strings, compute the entire value inside one full template or pre-shape data with transform/mutate/code.
- Available context: state, outputs, status, currentNodeRef, input, $lastOutputOf(ref), $input(path), env(key).
</templates>

<ops-notes>
- transform: apply JSON Patch ops to the current input payload.
- mutate: apply JSON Patch ops to execution.state only (paths start with /state).
- code: sandboxed JS; no require/process/import/eval; timeout enforced. Prefer transform/mutate for data shaping.
</ops-notes>

<environment>
- Use env('KEY') for all configuration and secrets, including any new variables you introduce.
- Do not attempt to read from process.env, code nodes, or fetch secrets yourself; the runtime provides env('KEY') at execution time.
- If a new variable is needed, reference it directly as env('NEW_KEY') and proceed; do not prompt for it, and do not hardcode defaults.
- Never log or echo the raw value of env(...); redact in outputs and logs.
</environment>

<testing>
Always pass Test Tool.arguments.
Build arguments from Get Tool(slug).parameters:
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

  model: 'anthropic/claude-sonnet-4.5',
  // Using system defaults for temperature and maxTokens

  // Tool assignment - comprehensive tools for tool creation and blueprint understanding
  assignedToolSlugs: [
    'tool-list',
    'tool-get',
    'tool-open',
    'tool-edit',
    'tool-test',
    'blueprint-lint',
    'node-schema',
    'blueprint-examples',
    'tool-add-blueprint-node',
    'tool-add-blueprint-edge',
    'tool-blueprint-edit-node',
    'tool-blueprint-remove-node',
    'tool-blueprint-edit-edge',
    'tool-blueprint-remove-edge',
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
