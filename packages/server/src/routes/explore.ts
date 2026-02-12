import type { Request, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'

import { optionalJwtAuth } from '@/middleware/jwt-auth'
import { validateData } from '@/utils/validation'
import { handleError, sendSuccess } from '@/utils/responseHelpers'

import { AgentTemplateRepository, ConnectorTemplateRepository, ToolTemplateRepository } from '@starships/models'
import type { AgentTemplateModel, ConnectorCatalogItem, ConnectorProvider, ToolTemplateModel } from '@starships/protocol'

const router: Router = Router()

type ConnectionLike = {
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null | undefined>
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
}

const ExploreSearchQuerySchema = z
  .object({
    q: z.string().optional(),
    type: z.enum(['all', 'agents', 'tools', 'connectors']).optional(),
    limit: z.coerce.number().min(1).max(60).optional(),
  })
  .strict()

const ExplorePopularQuerySchema = z
  .object({
    windowDays: z.coerce.number().min(1).max(365).optional(),
    limitAgents: z.coerce.number().min(1).max(24).optional(),
    limitTools: z.coerce.number().min(1).max(24).optional(),
  })
  .strict()

function toConnectorCatalogItem(tpl: Record<string, unknown>): ConnectorCatalogItem {
  const provider = String(tpl.provider || '').trim() as ConnectorProvider
  const name = String(tpl.name || '').trim() || provider
  const description = typeof tpl.description === 'string' ? tpl.description : ''
  const authType = ((tpl.authJson as unknown as { type?: string })?.type || (tpl.authType as string) || 'none') as ConnectorCatalogItem['auth']['type']
  return {
    provider,
    name,
    description,
    auth: { type: authType },
  }
}

async function resolveAgentsTemplateColumn(connection: ConnectionLike): Promise<'source_template_id' | 'template_id'> {
  // We renamed `agents.template_id -> agents.source_template_id` in older DBs, but local/dev
  // setups may have either column depending on migration history.
  //
  // IMPORTANT: We cannot reference both columns in SQL (Postgres errors if a column doesn't exist),
  // so we detect the available column first.
  const row = await connection.queryOne<{ has_source: boolean; has_template: boolean }>(
    `
      SELECT
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'source_template_id') AS has_source,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'template_id') AS has_template
    `
  )

  if (row?.has_source) return 'source_template_id'
  return 'template_id'
}

// GET /explore/search (public)
// Unified search endpoint for Explore (agents + tools + connectors), backed by DB queries.
router.get('/explore/search', optionalJwtAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const qd = validateData(ExploreSearchQuerySchema, req.query, res, 'explore search query')
    if (!qd) return

    const q = String(qd.q || '').trim()
    const type = qd.type ?? 'all'
    const limit = qd.limit ?? 24

    const agentRepo = new AgentTemplateRepository()
    const toolRepo = new ToolTemplateRepository()
    const connectorRepo = new ConnectorTemplateRepository()

    const shouldAgents = type === 'all' || type === 'agents'
    const shouldTools = type === 'all' || type === 'tools'
    const shouldConnectors = type === 'all' || type === 'connectors'

    const [agentsRaw, toolsRaw, connectorsBundle] = await Promise.all([
      shouldAgents ? (q ? agentRepo.searchTemplates(q) : agentRepo.findAll()) : Promise.resolve([] as AgentTemplateModel[]),
      shouldTools ? toolRepo.search({ query: q || undefined }) : Promise.resolve([] as ToolTemplateModel[]),
      shouldConnectors
        ? (async () => {
            // NOTE:
            // We intentionally query connector_templates directly here (DB-backed search).
            // Avoid relying on a repository method that might not be present at runtime in all dev setups.
            const connection = ((connectorRepo as any).getConnection?.() ?? null) as ConnectionLike | null
            if (!connection) {
              const all = await connectorRepo.list()
              const lowered = q.toLowerCase()
              const filtered = q
                ? all.filter(t => {
                    const provider = String((t as any)?.provider ?? '').toLowerCase()
                    const name = String((t as any)?.name ?? '').toLowerCase()
                    const desc = String((t as any)?.description ?? '').toLowerCase()
                    const category = String((t as any)?.category ?? '').toLowerCase()
                    return provider.includes(lowered) || name.includes(lowered) || desc.includes(lowered) || category.includes(lowered)
                  })
                : all
              const enabledOnly = filtered.filter(t => (t as any)?.isEnabled !== false)
              return { total: enabledOnly.length, rows: enabledOnly.slice(0, limit) as unknown as Array<Record<string, unknown>> }
            }

            const where: string[] = ['(is_enabled IS DISTINCT FROM FALSE)']
            const params: unknown[] = []
            let i = 1

            if (q) {
              if (q.length > 200) throw new Error('Search query cannot exceed 200 characters')
              params.push(`%${q}%`)
              const p = `$${i++}`
              where.push(`(provider ILIKE ${p} OR name ILIKE ${p} OR description ILIKE ${p} OR category ILIKE ${p})`)
            }

            const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

            const countSql = `SELECT COUNT(*)::int AS n FROM connector_templates ${whereSql}`
            const countRow = await connection.queryOne<{ n: number }>(countSql, params)

            params.push(limit)
            const pLimit = `$${i++}`
            const selectSql = `
              SELECT *
              FROM connector_templates
              ${whereSql}
              ORDER BY provider ASC, created_at DESC
              LIMIT ${pLimit}
            `
            const rows = await connection.query<Record<string, unknown>>(selectSql, params)
            return { total: countRow?.n ?? 0, rows: rows ?? [] }
          })()
        : Promise.resolve({ total: 0, rows: [] as Array<Record<string, unknown>> }),
    ])

    const agentsTotal = shouldAgents ? agentsRaw.length : 0
    const toolsTotal = shouldTools ? toolsRaw.length : 0
    const connectorsTotal = shouldConnectors ? connectorsBundle.total : 0

    const agents = shouldAgents ? agentsRaw.slice(0, limit) : []
    const tools = shouldTools ? toolsRaw.slice(0, limit) : []
    const connectors = shouldConnectors ? connectorsBundle.rows.slice(0, limit).map(toConnectorCatalogItem) : []

    sendSuccess(
      res,
      {
        q,
        type,
        limit,
        totals: {
          agents: agentsTotal,
          tools: toolsTotal,
          connectors: connectorsTotal,
        },
        agents,
        tools,
        connectors,
      },
      200
    )
  } catch (error) {
    handleError(error, res, 'explore search')
  }
})

// GET /explore/popular (public)
// Dedicated endpoint for "Popular" sections on Explore.
// NOTE: Do NOT use `*_templates.usage_count` (deprecated/unreliable); derive from messages/usage.
router.get('/explore/popular', optionalJwtAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const qd = validateData(ExplorePopularQuerySchema, req.query, res, 'explore popular query')
    if (!qd) return

    const windowDays = qd.windowDays ?? 30
    const limitAgents = qd.limitAgents ?? 6
    const limitTools = qd.limitTools ?? 6

    const agentRepo = new AgentTemplateRepository()
    const toolRepo = new ToolTemplateRepository()

    const connection = ((agentRepo as any).getConnection?.() ?? (toolRepo as any).getConnection?.() ?? null) as ConnectionLike | null
    if (!connection) throw new Error('Database connection unavailable for explore popular')

    const agentTemplateCol = await resolveAgentsTemplateColumn(connection)

    // Popular agent templates:
    // - Count distinct conversations and assistant messages produced by agents deployed from a template.
    // - Add token usage as a tie-breaker (conversation-level tokens).
    const agentIds = await connection.query<{ id: string }>(
      `
        WITH agent_msgs AS (
          SELECT
            a.${agentTemplateCol} AS template_id,
            m.conversation_id AS conversation_id
          FROM messages m
          JOIN agents a ON a.id = m.agent_id
          WHERE m.role = 'assistant'
            AND m.agent_id IS NOT NULL
            AND a.${agentTemplateCol} IS NOT NULL
            AND m.created_at >= NOW() - ($1::int * INTERVAL '1 day')
        ),
        agent_usage AS (
          SELECT
            template_id,
            COUNT(*)::int AS message_count,
            COUNT(DISTINCT conversation_id)::int AS conversation_count
          FROM agent_msgs
          GROUP BY template_id
        ),
        agent_tokens AS (
          SELECT
            am.template_id AS template_id,
            COALESCE(SUM(u.total_tokens), 0)::bigint AS token_count
          FROM agent_msgs am
          JOIN usage u ON u.conversation_id = am.conversation_id
          WHERE u.created_at >= NOW() - ($1::int * INTERVAL '1 day')
          GROUP BY am.template_id
        )
        SELECT at.id
        FROM agent_templates at
        JOIN agent_usage au ON au.template_id = at.id
        LEFT JOIN agent_tokens tok ON tok.template_id = at.id
        WHERE at.is_public = true
        ORDER BY au.conversation_count DESC, COALESCE(tok.token_count, 0) DESC, au.message_count DESC, at.created_at DESC
        LIMIT $2
      `,
      [windowDays, limitAgents]
    )

    const popularAgents: AgentTemplateModel[] = []
    for (const row of agentIds || []) {
      const id = String((row as any)?.id || '').trim()
      if (!id) continue
      try {
        const tpl = await agentRepo.findById(id)
        if (tpl && (tpl as any)?.isPublic) popularAgents.push(tpl)
      } catch {
        // ignore best-effort lookup failures; keep endpoint resilient
      }
    }

    // Popular tool templates:
    // - Count tool calls (assistant.tool_calls[*].function.name) and distinct conversations.
    // - Add conversation-level token usage as a tie-breaker.
    const toolIds = await connection.query<{ id: string }>(
      `
        WITH tool_calls AS (
          SELECT
            (tc -> 'function' ->> 'name') AS tool_slug,
            m.conversation_id AS conversation_id
          FROM messages m
          JOIN LATERAL jsonb_array_elements(m.tool_calls) tc ON TRUE
          WHERE m.role = 'assistant'
            AND m.tool_calls IS NOT NULL
            AND jsonb_typeof(m.tool_calls) = 'array'
            AND m.created_at >= NOW() - ($1::int * INTERVAL '1 day')
        ),
        tool_usage AS (
          SELECT
            tool_slug,
            COUNT(*)::int AS call_count,
            COUNT(DISTINCT conversation_id)::int AS conversation_count
          FROM tool_calls
          WHERE tool_slug IS NOT NULL AND tool_slug <> ''
          GROUP BY tool_slug
        ),
        tool_tokens AS (
          SELECT
            tc.tool_slug AS tool_slug,
            COALESCE(SUM(u.total_tokens), 0)::bigint AS token_count
          FROM tool_calls tc
          JOIN usage u ON u.conversation_id = tc.conversation_id
          WHERE u.created_at >= NOW() - ($1::int * INTERVAL '1 day')
          GROUP BY tc.tool_slug
        )
        SELECT tt.id
        FROM tool_templates tt
        JOIN tool_usage tu ON tu.tool_slug = tt.slug
        LEFT JOIN tool_tokens tok ON tok.tool_slug = tt.slug
        WHERE tt.is_public = true
        ORDER BY tu.conversation_count DESC, COALESCE(tok.token_count, 0) DESC, tu.call_count DESC, tt.created_at DESC
        LIMIT $2
      `,
      [windowDays, limitTools]
    )

    const popularTools: ToolTemplateModel[] = []
    for (const row of toolIds || []) {
      const id = String((row as any)?.id || '').trim()
      if (!id) continue
      try {
        const tpl = await toolRepo.findById(id)
        if (tpl && (tpl as any)?.isPublic) popularTools.push(tpl)
      } catch {
        // ignore best-effort lookup failures
      }
    }

    sendSuccess(
      res,
      {
        windowDays,
        agents: popularAgents,
        tools: popularTools,
      },
      200
    )
  } catch (error) {
    handleError(error, res, 'explore popular')
  }
})

export default router

