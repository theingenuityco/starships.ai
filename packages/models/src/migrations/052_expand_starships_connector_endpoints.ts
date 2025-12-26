import type { Client } from 'pg';

/**
 * Migration 052: Expand Starships connector endpoint catalog
 *
 * The internal `starships` connector is used by many seeded tools. In V2, connector_action
 * resolution depends on connector_templates.endpoints_json containing entries whose `name`
 * matches the `action` used by tools (e.g. list-tools, get-tool).
 *
 * Migration 051 only seeded 2 endpoints, which leaves the Starships endpoint catalog severely
 * incomplete and can break connector_action-based tools.
 *
 * This migration overwrites the Starships connector template's endpoints_json with a complete
 * catalog derived from the seeded Starships tools.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const baseUrl = '{{ runtimeEnv.SERVER_URL }}/api/v1';

    const authJson = {
      type: 'platform_jwt',
      headerName: 'Authorization',
      tokenPrefix: 'Bearer',
    };

    const endpoints = [
      // ---------------------------------------------------------------------
      // Core internal endpoint used by tool-call approvals / execution
      // ---------------------------------------------------------------------
      {
        name: 'authorize-and-maybe-execute-tool',
        description: 'Authorize and optionally execute a tool call via the Starships API',
        method: 'POST',
        path: '/conversations/{conversationId}/tool-calls/authorize-and-maybe-execute',
        parameters: {
          type: 'object',
          required: ['agentId', 'toolSlug', 'toolCallId', 'args'],
          properties: {
            agentId: { type: 'string' },
            toolSlug: { type: 'string' },
            toolCallId: { type: 'string' },
            args: { type: 'object' },
            conversationId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            conversationId: '{{ String(runtimeEnv.CONVERSATION_ID ?? args.conversationId ?? "") }}',
          },
          body: {
            agentId: '{{ String(args.agentId ?? "") }}',
            toolSlug: '{{ String(args.toolSlug ?? "") }}',
            toolCallId: '{{ String(args.toolCallId ?? "") }}',
            args: '{{ args.args ?? {} }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 120000,
      },

      // ---------------------------------------------------------------------
      // Connector templates + runtime discovery
      // ---------------------------------------------------------------------
      {
        name: 'list-connectors',
        description: 'List connectors for a starship',
        method: 'GET',
        path: '/starships/{starshipId}/connectors',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },

      // ---------------------------------------------------------------------
      // Tools (used by seeded tools: list-tools, get-tool, test-tool, open-tool, edit-tool, modify-tool-blueprint-*)
      // ---------------------------------------------------------------------
      {
        name: 'list-tools',
        description: 'List tools for a starship',
        method: 'GET',
        path: '/starships/{starshipId}/tools',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'get-tool',
        description: 'Get a tool by slug within a starship',
        method: 'GET',
        path: '/starships/{starshipId}/tools/{slug}',
        parameters: {
          type: 'object',
          required: ['starshipId', 'slug'],
          properties: {
            starshipId: { type: 'string' },
            slug: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            slug: '{{ String(args.slug ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'create-tool',
        description: 'Create a tool within a starship',
        method: 'POST',
        path: '/starships/{starshipId}/tools',
        parameters: {
          type: 'object',
          required: ['starshipId', 'name', 'description'],
          properties: {
            starshipId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            parameters: { type: 'object' },
            blueprint: { type: 'object' },
            configuration: { type: 'object' },
            isEnabled: { type: 'boolean' },
            status: { type: 'string' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
          body: {
            name: '{{ args.name }}',
            description: '{{ args.description }}',
            parameters: '{{ args.parameters }}',
            blueprint: '{{ args.blueprint }}',
            configuration: '{{ args.configuration }}',
            isEnabled: '{{ args.isEnabled }}',
            status: '{{ args.status }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'update-tool',
        description: 'Update a tool by id (partial updates supported)',
        method: 'PUT',
        path: '/tools/{toolId}',
        parameters: {
          type: 'object',
          required: ['toolId'],
          properties: {
            toolId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            slug: { type: 'string' },
            parameters: { type: 'object' },
            blueprint: { type: 'object' },
            configuration: { type: 'object' },
            isEnabled: { type: 'boolean' },
            status: { type: 'string' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            toolId: '{{ String(args.toolId ?? "") }}',
          },
          body: {
            name: '{{ args.name }}',
            description: '{{ args.description }}',
            slug: '{{ args.slug }}',
            parameters: '{{ args.parameters }}',
            blueprint: '{{ args.blueprint }}',
            configuration: '{{ args.configuration }}',
            isEnabled: '{{ args.isEnabled }}',
            status: '{{ args.status }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },

      // ---------------------------------------------------------------------
      // Agents (used by seeded tools: list-agents, get-agent, open-agent, edit-agent, assign/unassign-agent-tool)
      // ---------------------------------------------------------------------
      {
        name: 'list-agents',
        description: 'List agents for a starship',
        method: 'GET',
        path: '/starships/{starshipId}/agents',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'get-agent',
        description: 'Get an agent by slug within a starship',
        method: 'GET',
        path: '/starships/{starshipId}/agents/{slug}',
        parameters: {
          type: 'object',
          required: ['starshipId', 'slug'],
          properties: {
            starshipId: { type: 'string' },
            slug: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            slug: '{{ String(args.slug ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'create-agent',
        description: 'Create an agent (draft) for a starship',
        method: 'POST',
        path: '/agents',
        parameters: {
          type: 'object',
          required: ['starshipId', 'name'],
          properties: {
            starshipId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            model: { type: 'string' },
            systemPrompt: { type: 'string' },
            temperature: { type: 'number' },
            maxTokens: { type: 'number' },
            previewPrompts: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: true,
        },
        mapping: {
          body: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            name: '{{ args.name }}',
            description: '{{ args.description }}',
            model: '{{ args.model }}',
            systemPrompt: '{{ args.systemPrompt }}',
            temperature: '{{ args.temperature }}',
            maxTokens: '{{ args.maxTokens }}',
            previewPrompts: '{{ args.previewPrompts }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'get-agent-by-slug',
        description: 'Get an agent by slug or id (global agents route)',
        method: 'GET',
        path: '/agents/{slugOrId}',
        parameters: {
          type: 'object',
          required: ['slugOrId'],
          properties: {
            slugOrId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            slugOrId: '{{ String(args.slugOrId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'update-agent',
        description: 'Update an agent by id (partial updates supported)',
        method: 'PUT',
        path: '/agents/{agentId}',
        parameters: {
          type: 'object',
          required: ['agentId'],
          properties: {
            agentId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            model: { type: 'string' },
            systemPrompt: { type: 'string' },
            temperature: { type: 'number' },
            maxTokens: { type: 'number' },
            blueprint: { type: 'object' },
            timeout: { type: 'number' },
            previewPrompts: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            agentId: '{{ String(args.agentId ?? "") }}',
          },
          body: {
            name: '{{ args.name }}',
            description: '{{ args.description }}',
            model: '{{ args.model }}',
            systemPrompt: '{{ args.systemPrompt }}',
            temperature: '{{ args.temperature }}',
            maxTokens: '{{ args.maxTokens }}',
            blueprint: '{{ args.blueprint }}',
            timeout: '{{ args.timeout }}',
            previewPrompts: '{{ args.previewPrompts }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'assign-agent-tool',
        description: 'Assign a tool to an agent by id + toolSlug',
        method: 'POST',
        path: '/agents/{agentId}/tools/{toolSlug}',
        parameters: {
          type: 'object',
          required: ['agentId', 'toolSlug'],
          properties: {
            agentId: { type: 'string' },
            toolSlug: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            agentId: '{{ String(args.agentId ?? "") }}',
            toolSlug: '{{ String(args.toolSlug ?? "") }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'unassign-agent-tool',
        description: 'Remove a tool from an agent by id + toolSlug',
        method: 'DELETE',
        path: '/agents/{agentId}/tools/{toolSlug}',
        parameters: {
          type: 'object',
          required: ['agentId', 'toolSlug'],
          properties: {
            agentId: { type: 'string' },
            toolSlug: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            agentId: '{{ String(args.agentId ?? "") }}',
            toolSlug: '{{ String(args.toolSlug ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },

      // ---------------------------------------------------------------------
      // Docs (used by seeded tools: search-docs, get-doc, create-widget search mode)
      // ---------------------------------------------------------------------
      {
        name: 'search-docs',
        description: 'Search docs listing / fulltext',
        method: 'GET',
        path: '/docs',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            limit: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          query: {
            q: '{{ String(args.q ?? "") }}',
            limit: '{{ args.limit == null ? "" : String(args.limit) }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'get-doc',
        description: 'Get a single doc page by slug (supports nested slugs)',
        method: 'GET',
        path: '/docs/{slug}',
        parameters: {
          type: 'object',
          required: ['slug'],
          properties: {
            slug: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            slug: '{{ String(args.slug ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },

      // ---------------------------------------------------------------------
      // OpenRouter proxy (used by seeded tool: list-models)
      // ---------------------------------------------------------------------
      {
        name: 'list-models',
        description: 'List OpenRouter models via Starships proxy',
        method: 'GET',
        path: '/openrouter/models',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },

      // ---------------------------------------------------------------------
      // Conversations (used by seeded tool: call-agent)
      // ---------------------------------------------------------------------
      {
        name: 'create-conversation',
        description: 'Create a conversation (optionally as a child conversation)',
        method: 'POST',
        path: '/conversations',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            title: { type: 'string' },
            starshipId: { type: 'string' },
            agentSlug: { type: 'string' },
            parentConversationId: { type: 'string' },
          },
          additionalProperties: true,
        },
        mapping: {
          body: {
            title: '{{ args.title }}',
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            agentSlug: '{{ args.agentSlug }}',
            parentConversationId: '{{ args.parentConversationId }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'send-message',
        description: 'Send a message to a conversation',
        method: 'POST',
        path: '/conversations/{conversationId}/messages',
        parameters: {
          type: 'object',
          required: ['conversationId', 'content'],
          properties: {
            conversationId: { type: 'string' },
            content: { type: 'string' },
            sync: { type: 'boolean' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            conversationId: '{{ String(args.conversationId ?? "") }}',
          },
          body: {
            content: '{{ args.content }}',
            sync: '{{ args.sync }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 300000,
      },

      // ---------------------------------------------------------------------
      // Widgets (used by seeded tools: create-widget, update-widget)
      // ---------------------------------------------------------------------
      {
        name: 'create-widget',
        description: 'Create a widget',
        method: 'POST',
        path: '/widgets',
        parameters: {
          type: 'object',
          required: ['name', 'description', 'widgetType', 'props', 'starshipId'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            widgetType: { type: 'string' },
            props: { type: 'object' },
            starshipId: { type: 'string' },
          },
          additionalProperties: true,
        },
        mapping: {
          body: {
            name: '{{ args.name }}',
            description: '{{ args.description }}',
            widgetType: '{{ args.widgetType }}',
            props: '{{ args.props }}',
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 5000,
      },
      {
        name: 'update-widget',
        description: 'Update a widget by id',
        method: 'PUT',
        path: '/widgets/{widgetId}',
        parameters: {
          type: 'object',
          required: ['widgetId'],
          properties: {
            widgetId: { type: 'string' },
            props: { type: 'object' },
            name: { type: 'string' },
            description: { type: 'string' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            widgetId: '{{ String(args.widgetId ?? "") }}',
          },
          body: {
            props: '{{ args.props }}',
            name: '{{ args.name }}',
            description: '{{ args.description }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 5000,
      },
    ];

    await client.query(
      `
        UPDATE connector_templates
        SET
          auth_type = 'platform_jwt',
          base_url = $1,
          auth_json = $2::jsonb,
          endpoints_json = $3::jsonb,
          updated_at = NOW()
        WHERE provider = 'starships'
      `,
      [baseUrl, JSON.stringify(authJson), JSON.stringify(endpoints)]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const baseUrl = '{{ runtimeEnv.SERVER_URL }}/api/v1';

    const authJson = {
      type: 'platform_jwt',
      headerName: 'Authorization',
      tokenPrefix: 'Bearer',
    };

    const endpoints = [
      {
        name: 'authorize-and-maybe-execute-tool',
        description: 'Authorize and optionally execute a tool call via the Starships API',
        method: 'POST',
        path: '/conversations/{conversationId}/tool-calls/authorize-and-maybe-execute',
        parameters: {
          type: 'object',
          required: ['agentId', 'toolSlug', 'toolCallId', 'args'],
          properties: {
            agentId: { type: 'string' },
            toolSlug: { type: 'string' },
            toolCallId: { type: 'string' },
            args: { type: 'object' },
            conversationId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            conversationId: '{{ String(runtimeEnv.CONVERSATION_ID ?? args.conversationId ?? "") }}',
          },
          body: {
            agentId: '{{ String(args.agentId ?? "") }}',
            toolSlug: '{{ String(args.toolSlug ?? "") }}',
            toolCallId: '{{ String(args.toolCallId ?? "") }}',
            args: '{{ args.args ?? {} }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 120000,
      },
      {
        name: 'list-connectors',
        description: 'List connectors for a starship',
        method: 'GET',
        path: '/starships/{starshipId}/connectors',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
    ];

    await client.query(
      `
        UPDATE connector_templates
        SET
          auth_type = 'platform_jwt',
          base_url = $1,
          auth_json = $2::jsonb,
          endpoints_json = $3::jsonb,
          updated_at = NOW()
        WHERE provider = 'starships'
      `,
      [baseUrl, JSON.stringify(authJson), JSON.stringify(endpoints)]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
