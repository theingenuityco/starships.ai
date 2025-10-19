import { Blueprint, BlueprintBuilder } from '@starships/autopilot';

/**
 * Configuration for creating a focused entity management blueprint
 */
export interface FocusedEntityConfig {
  /** The state field name (e.g., 'focusedTool', 'focusedAgent') */
  stateFieldName: string;

  /** The XML-like tag for context (e.g., 'focused-tool', 'focused-agent') */
  contextTag: string;

  /** Fields to display in context (template string with ${state.focusedX.field} interpolations) */
  contextFields: string;

  /** Tool slugs that trigger focusedEntity updates */
  updateTriggerTools: string[];

  /** Instructions text for context message */
  instructions: string;

  /** Metadata for the blueprint */
  metadata?: Record<string, unknown>;
}

/**
 * Create a focused entity management blueprint
 *
 * This factory creates blueprints for agents that manipulate entities (tools, agents, workflows, etc.)
 * with sophisticated state management patterns:
 *
 * - **Focused Entity Pattern**: Maintains current entity in state for efficient iteration
 * - **Context Injection**: Adds focused entity details to conversation at strategic points
 * - **Minimal Responses**: Entity-modifying tools return confirmations only (data in state)
 * - **Tool-Calling Loop**: Standard LLM → Conditional → Tool → back to LLM pattern
 * - **Duplicate Prevention**: Guards against repeated context injection
 *
 * Used by:
 * - Daedalus (Tool Creator): manages focusedTool
 * - Gaia (Agent Creator): manages focusedAgent
 * - Future creators: workflows, templates, etc.
 *
 * @param config - Configuration for the focused entity pattern
 * @returns Complete blueprint with focused entity management
 */
export function createFocusedEntityBlueprint(config: FocusedEntityConfig): Blueprint {
  const { stateFieldName, contextTag, contextFields, updateTriggerTools, instructions, metadata = {} } = config;

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

  // Build tool slugs array as JSON for template
  const toolSlugsJson = JSON.stringify(updateTriggerTools);

  // Mutate node to add tool result to state
  const toolResultNodeRef = builder.addNode({
    type: 'mutate',
    name: 'Add Tool Result',
    description: 'Add tool result message to conversation state',
    parameters: {
      mutations: [
        {
          operation: 'add' as const,
          path: '/state/messages/-',
          value: `{{ (() => { const toolCallId = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls?.[0]?.id ?? ""; const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const toolSlug = calls?.[0]?.function?.name; const http = $lastOutputOf("${toolNodeRef}")[0]?.json ?? {}; const modifyOps = ${toolSlugsJson}; let content; if (modifyOps.includes(toolSlug)) { const status = http.status || http.body?.status || 200; const success = status >= 200 && status < 300; const slug = http.body?.data?.slug || http.body?.slug || 'unknown'; content = JSON.stringify({ success, message: success ? 'Entity updated successfully' : 'Entity operation failed', slug }); } else { content = typeof http === 'string' ? http : JSON.stringify(http); } return { role: "tool", toolCallId, content }; })() }}`,
        },
      ],
    },
  });

  // Conditional node to check if focused entity exists (pre-LLM)
  const checkFocusedEntityRef = builder.addNode({
    type: 'conditional',
    name: 'Check Focused Entity',
    description: `Check if ${stateFieldName} exists to add context`,
    parameters: {
      condition: `{{ (() => { try { const hasFE = !!(state.${stateFieldName} && typeof state.${stateFieldName} === "object" && Object.keys(state.${stateFieldName}).length > 0); if (!hasFE) return "no_context"; const msgs = Array.isArray(state.messages) ? state.messages : []; const m1 = msgs[1]; const isCtx = m1 && m1.role === "system" && typeof m1.content === "string" && m1.content.includes("<${contextTag}>"); return isCtx ? "no_context" : "add_context"; } catch { return "add_context"; } })() }}`,
    },
  });

  // Mutate node to add focused entity context (pre-LLM)
  const focusedEntityContextRef = builder.addNode({
    type: 'mutate',
    name: 'Add Focused Entity Context',
    description: 'Add focused entity as system message',
    parameters: {
      mutations: [
        {
          operation: 'add' as const,
          path: '/state/messages/1',
          value: `{{ {
            role: 'system',
            content: \`<${contextTag}>
${contextFields}
</${contextTag}>

<instructions>
${instructions}
</instructions>\`
          } }}`,
        },
      ],
    },
  });

  // Update Focused Entity after tool execution
  const updateFocusedEntityRef = builder.addNode({
    type: 'mutate',
    name: 'Update Focused Entity',
    description: `Update ${stateFieldName} in state after tool execution`,
    parameters: {
      mutations: [
        {
          operation: 'replace' as const,
          path: `/state/${stateFieldName}`,
          value: `{{ (() => {
            const calls = $lastOutputOf("ai_assistant")[0]?.json?.choices?.[0]?.message?.toolCalls;
            const toolSlug = calls?.[0]?.function?.name;
            const updateTools = ${toolSlugsJson};
            if (updateTools.includes(toolSlug)) {
              const httpResponse = $lastOutputOf("execute_tool")[0]?.json ?? {};
              const entityData = httpResponse.body?.data || httpResponse.body;
              if (!entityData || !entityData.name) return state.${stateFieldName} || null;
              return entityData;
            }
            return null;
          })() }}`,
        },
      ],
    },
  });

  // Post-tool check for context insertion
  const checkFocusedEntityAfterToolRef = builder.addNode({
    type: 'conditional',
    name: 'Check Focused Entity (After Tool)',
    description: `Check if ${stateFieldName} exists to add context before appending tool result`,
    parameters: {
      condition: `{{ (() => { try { const hasFE = !!(state.${stateFieldName} && typeof state.${stateFieldName} === "object" && Object.keys(state.${stateFieldName}).length > 0); if (!hasFE) return "no_context"; const msgs = Array.isArray(state.messages) ? state.messages : []; const m1 = msgs[1]; const isCtx = m1 && m1.role === "system" && typeof m1.content === "string" && m1.content.includes("<${contextTag}>"); return isCtx ? "no_context" : "add_context"; } catch { return "add_context"; } })() }}`,
    },
  });

  // Focused Entity Context node for post-tool path
  const focusedEntityContextAfterToolRef = builder.addNode({
    type: 'mutate',
    name: 'Add Focused Entity Context (After Tool)',
    description: 'Add focused entity context before appending tool result',
    parameters: {
      mutations: [
        {
          operation: 'add' as const,
          path: '/state/messages/1',
          value: `{{ {
            role: 'system',
            content: \`<${contextTag}>
${contextFields}
</${contextTag}>

<instructions>
${instructions}
</instructions>\`
          } }}`,
        },
      ],
    },
  });

  // Connect all nodes
  let blueprintBuilder = builder
    .addEdge(startRef, checkFocusedEntityRef)
    .addEdge(checkFocusedEntityRef, focusedEntityContextRef, 'add_context')
    .addEdge(focusedEntityContextRef, llmNodeRef)
    .addEdge(checkFocusedEntityRef, llmNodeRef, 'no_context')
    .addEdge(llmNodeRef, conditionalNodeRef)
    .addEdge(conditionalNodeRef, llmNodeRef, 'continue')
    .addEdge(conditionalNodeRef, argsNodeRef, 'call_tool')
    .addEdge(argsNodeRef, toolNodeRef)
    .addEdge(toolNodeRef, updateFocusedEntityRef)
    .addEdge(updateFocusedEntityRef, checkFocusedEntityAfterToolRef)
    .addEdge(checkFocusedEntityAfterToolRef, focusedEntityContextAfterToolRef, 'add_context')
    .addEdge(focusedEntityContextAfterToolRef, toolResultNodeRef)
    .addEdge(checkFocusedEntityAfterToolRef, toolResultNodeRef, 'no_context')
    .addEdge(toolResultNodeRef, llmNodeRef)
    .addEdge(conditionalNodeRef, endRef, 'complete')
    .setMetadata('generatedBy', 'focusedEntity blueprint factory')
    .setMetadata('pattern', 'focused-entity-management')
    .setMetadata('stateField', stateFieldName)
    .setMetadata('contextTag', contextTag);

  // Add custom metadata entries
  for (const [key, value] of Object.entries(metadata)) {
    blueprintBuilder = blueprintBuilder.setMetadata(key, value);
  }

  return blueprintBuilder.build();
}
