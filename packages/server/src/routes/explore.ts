import type { Request, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'

import { optionalJwtAuth } from '@/middleware/jwt-auth'
import { validateData } from '@/utils/validation'
import { handleError, sendSuccess } from '@/utils/responseHelpers'

import { AgentTemplateRepository, ConnectorTemplateRepository, ToolTemplateRepository } from '@starships/models'
import type { AgentTemplateModel, ConnectorCatalogItem, ConnectorProvider, ToolTemplateModel } from '@starships/protocol'

const router: Router = Router()

const ExploreSearchQuerySchema = z
  .object({
    q: z.string().optional(),
    type: z.enum(['all', 'agents', 'tools', 'connectors']).optional(),
    limit: z.coerce.number().min(1).max(60).optional(),
  })
  .strict()

function toConnectorCatalogItem(tpl: Record<string, unknown>): ConnectorCatalogItem {
  const provider = String(tpl.provider || '').trim() as ConnectorProvider
  const name = String(tpl.name || '').trim() || provider
  const description = typeof tpl.description === 'string' ? tpl.description : undefined
  const authType = ((tpl.authJson as unknown as { type?: string })?.type || (tpl.authType as string) || 'none') as ConnectorCatalogItem['auth']['type']
  return {
    provider,
    name,
    description,
    auth: { type: authType },
  }
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
            const connection = (connectorRepo as any).getConnection?.()
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
              ORDER BY usage_count DESC, provider ASC, created_at DESC
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

export default router

