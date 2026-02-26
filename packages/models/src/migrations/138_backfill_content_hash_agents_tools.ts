import type { Client } from 'pg';
import { computeAgentContentHash, computeToolContentHash } from '@/utils/contentHash';

const BATCH_SIZE = 500;

export async function up(client: Client): Promise<void> {
  const getRows = <T>(result: unknown): T[] => {
    if (Array.isArray(result)) return result as T[];
    const anyRes = result as { rows?: unknown };
    return Array.isArray(anyRes?.rows) ? (anyRes.rows as T[]) : [];
  };

  await client.query('BEGIN');

  try {
    // -------------------------------------------------------------------------
    // TOOLS
    // -------------------------------------------------------------------------
    while (true) {
      const toolsRes = await client.query<{
        id: string;
        name: string | null;
        description: string | null;
        parameters: unknown;
        blueprint: unknown;
        transforms: unknown;
        mutations: unknown;
        condition: string | null;
        is_enabled: boolean | null;
        status: string | null;
      }>(
        `
        SELECT
          id,
          name,
          description,
          parameters,
          blueprint,
          transforms,
          mutations,
          condition,
          is_enabled,
          status
        FROM tools
        WHERE content_hash IS NULL OR char_length(content_hash) <> 64
        ORDER BY created_at ASC
        LIMIT $1
        `,
        [BATCH_SIZE]
      );

      const tools = getRows<{
        id: string;
        name: string | null;
        description: string | null;
        parameters: unknown;
        blueprint: unknown;
        transforms: unknown;
        mutations: unknown;
        condition: string | null;
        is_enabled: boolean | null;
        status: string | null;
      }>(toolsRes);
      if (tools.length === 0) break;

      for (const t of tools) {
        const hash = computeToolContentHash({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          blueprint: t.blueprint,
          transforms: t.transforms,
          mutations: t.mutations,
          condition: t.condition,
          isEnabled: t.is_enabled,
          status: t.status,
        });

        await client.query('UPDATE tools SET content_hash = $2, updated_at = NOW() WHERE id = $1', [t.id, hash]);
      }
    }

    // -------------------------------------------------------------------------
    // AGENTS
    // -------------------------------------------------------------------------
    while (true) {
      const agentsRes = await client.query<{
        id: string;
        name: string | null;
        role: string | null;
        description: string | null;
        model: string | null;
        temperature: number | null;
        max_tokens: number | null;
        timeout: number | null;
        reasoning: unknown;
        system_prompt: string | null;
        state: unknown;
        blueprint: unknown;
        category: string | null;
        preview_prompts: unknown;
      }>(
        `
        SELECT
          id,
          name,
          role,
          description,
          model,
          temperature,
          max_tokens,
          timeout,
          reasoning,
          system_prompt,
          state,
          blueprint,
          category,
          preview_prompts
        FROM agents
        WHERE content_hash IS NULL OR char_length(content_hash) <> 64
        ORDER BY created_at ASC
        LIMIT $1
        `,
        [BATCH_SIZE]
      );

      const agents = getRows<{
        id: string;
        name: string | null;
        role: string | null;
        description: string | null;
        model: string | null;
        temperature: number | null;
        max_tokens: number | null;
        timeout: number | null;
        reasoning: unknown;
        system_prompt: string | null;
        state: unknown;
        blueprint: unknown;
        category: string | null;
        preview_prompts: unknown;
      }>(agentsRes);
      if (agents.length === 0) break;

      const agentIds = agents.map((a) => a.id);

      // Load assigned tool slugs for these agents (sorted).
      const assignedRes = await client.query<{ agent_id: string; tool_slug: string }>(
        `
        SELECT
          at.agent_id as agent_id,
          t.slug as tool_slug
        FROM agent_tools at
        INNER JOIN tools t ON t.id = at.tool_id
        WHERE at.agent_id = ANY($1::text[])
        ORDER BY at.agent_id, t.slug ASC
        `,
        [agentIds]
      );

      const assignedByAgentId = new Map<string, string[]>();
      for (const row of getRows<{ agent_id: string; tool_slug: string }>(assignedRes)) {
        const list = assignedByAgentId.get(row.agent_id) ?? [];
        list.push(row.tool_slug);
        assignedByAgentId.set(row.agent_id, list);
      }

      for (const a of agents) {
        const assignedToolSlugs = assignedByAgentId.get(a.id) ?? [];
        const hash = computeAgentContentHash({
          name: a.name,
          role: a.role,
          description: a.description,
          model: a.model,
          temperature: a.temperature,
          maxTokens: a.max_tokens,
          timeout: a.timeout,
          reasoning: a.reasoning,
          systemPrompt: a.system_prompt,
          state: a.state,
          blueprint: a.blueprint,
          category: a.category,
          previewPrompts: a.preview_prompts,
          assignedToolSlugs,
        });

        await client.query('UPDATE agents SET content_hash = $2, updated_at = NOW() WHERE id = $1', [a.id, hash]);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Down migration: clear only hashes (do not drop columns; that's handled by 137 down).
    await client.query(`UPDATE tools SET content_hash = NULL WHERE content_hash IS NOT NULL`);
    await client.query(`UPDATE agents SET content_hash = NULL WHERE content_hash IS NOT NULL`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

