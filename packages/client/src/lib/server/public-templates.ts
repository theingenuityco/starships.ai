import 'server-only'

import type { ApiResponse, ApiResponseMeta, AgentTemplateModel, ConnectorCatalogResponse, ConnectorCatalogItem, ToolTemplateModel } from '@starships/protocol'
import { getPublicEnvConfig } from '@starships/env/public'

function normalizeBaseUrl(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

let didWarnPublicUrlFallback = false

function getPublicBaseUrl(): string {
  // Public marketing pages should fetch from the *public* origin so the HTML
  // they generate is consistent with what the browser can reach.
  // (Using SERVER_URL can succeed server-side, but the browser may not have the same routing.)
  const { PUBLIC_URL } = getPublicEnvConfig()
  const fromPublicEnv = normalizeBaseUrl(PUBLIC_URL || '')
  if (fromPublicEnv) return fromPublicEnv

  // Fallback: Next in a monorepo can fail to load the root `.env` depending on how it’s started.
  // In `pnpm dev`, we always start the reverse proxy on PROXY_PORT (default 8080), which exposes `/api/*`
  // publicly. Using that origin keeps ISR HTML consistent with what the browser can reach.
  //
  // NOTE: We still recommend setting PUBLIC_URL explicitly in all environments.
  const proxyPort = String(process.env.PROXY_PORT || '8080').trim() || '8080'
  const fallback = `http://localhost:${proxyPort}`
  if (!didWarnPublicUrlFallback) {
    didWarnPublicUrlFallback = true
    console.warn('[public-templates] PUBLIC_URL missing; falling back to', { fallback })
  }
  return fallback
}

function absolutizePublicUrl(pathOrUrl: unknown, publicBaseUrl: string): string | undefined {
  const raw = typeof pathOrUrl === 'string' ? pathOrUrl.trim() : ''
  if (!raw) return undefined
  // Already absolute (http/https)
  if (/^https?:\/\//i.test(raw)) return raw
  // Only absolutize root-relative URLs
  if (raw.startsWith('/')) return `${publicBaseUrl}${raw}`
  return raw
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Request failed (${res.status}) for ${url}${body ? `: ${body.slice(0, 240)}` : ''}`)
  }
  return (await res.json()) as T
}

type Pagination = {
  page: number
  limit: number
  total: number
  has_next: boolean
  has_prev: boolean
}

function getPagination(meta: ApiResponseMeta | undefined | null): Pagination | null {
  const p = (meta as any)?.pagination as Partial<Pagination> | undefined
  if (!p) return null
  const page = typeof p.page === 'number' ? p.page : Number(p.page)
  const limit = typeof p.limit === 'number' ? p.limit : Number(p.limit)
  const total = typeof p.total === 'number' ? p.total : Number(p.total)
  if (!Number.isFinite(page) || !Number.isFinite(limit) || !Number.isFinite(total)) return null
  return {
    page,
    limit,
    total,
    has_next: Boolean((p as any).has_next),
    has_prev: Boolean((p as any).has_prev),
  }
}

export type PaginatedPublicResult<T> = {
  items: T[]
  pagination: Pagination
}

export async function fetchPublicAgentTemplates(args?: {
  category?: string
  search?: string
  revalidateSeconds?: number
}): Promise<AgentTemplateModel[]> {
  try {
    const base = getPublicBaseUrl()

    const u = new URL('/api/v1/agent-templates', base)
    if (args?.category) u.searchParams.set('category', args.category)
    if (args?.search) u.searchParams.set('search', args.search)

    const json = await fetchJson<ApiResponse<AgentTemplateModel[]>>(u.toString(), {
      // Match our page ISR window by default.
      next: { revalidate: args?.revalidateSeconds ?? 3600, tags: ['public-agent-templates'] },
      headers: { Accept: 'application/json' },
    })
    const list = Array.isArray(json.data) ? json.data : []
    // Ensure any avatar URLs embedded in the HTML are reachable from the public origin.
    return list.map(t => ({
      ...t,
      avatarUrl: absolutizePublicUrl(t.avatarUrl, base),
    }))
  } catch (e) {
    console.warn('[public-templates] fetchPublicAgentTemplates failed', {
      // base/url may not be available depending on failure mode
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

export async function fetchPublicAgentTemplateBySlug(args: { slug: string; revalidateSeconds?: number }): Promise<AgentTemplateModel | null> {
  try {
    const base = getPublicBaseUrl()
    const slug = String(args.slug || '').trim()
    if (!slug) return null

    const u = new URL(`/api/v1/agent-templates/${encodeURIComponent(slug)}`, base)
    const json = await fetchJson<ApiResponse<AgentTemplateModel>>(u.toString(), {
      next: { revalidate: args.revalidateSeconds ?? 3600, tags: ['public-agent-templates'] },
      headers: { Accept: 'application/json' },
    })

    const tpl = json.data
    if (!tpl || typeof tpl !== 'object') return null
    return {
      ...(tpl as AgentTemplateModel),
      avatarUrl: absolutizePublicUrl((tpl as AgentTemplateModel).avatarUrl, base),
    }
  } catch (e) {
    console.warn('[public-templates] fetchPublicAgentTemplateBySlug failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

export async function fetchPublicAgentTemplatesPage(args: {
  page: number
  limit: number
  category?: string
  search?: string
  revalidateSeconds?: number
}): Promise<PaginatedPublicResult<AgentTemplateModel>> {
  try {
    const base = getPublicBaseUrl()
    const page = Number.isFinite(args.page) ? Math.max(1, Math.floor(args.page)) : 1
    const limit = Number.isFinite(args.limit) ? Math.max(1, Math.floor(args.limit)) : 24

    const u = new URL('/api/v1/agent-templates', base)
    u.searchParams.set('page', String(page))
    u.searchParams.set('limit', String(limit))
    if (args.category) u.searchParams.set('category', args.category)
    if (args.search) u.searchParams.set('search', args.search)

    const json = await fetchJson<ApiResponse<AgentTemplateModel[]>>(u.toString(), {
      next: { revalidate: args.revalidateSeconds ?? 3600, tags: ['public-agent-templates'] },
      headers: { Accept: 'application/json' },
    })

    const list = Array.isArray(json.data) ? json.data : []
    const pagination = getPagination(json.meta) ?? { page, limit, total: list.length, has_next: list.length === limit, has_prev: page > 1 }
    return {
      items: list.map(t => ({
        ...t,
        avatarUrl: absolutizePublicUrl(t.avatarUrl, base),
      })),
      pagination,
    }
  } catch (e) {
    console.warn('[public-templates] fetchPublicAgentTemplatesPage failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { items: [], pagination: { page: 1, limit: args.limit, total: 0, has_next: false, has_prev: false } }
  }
}

export async function fetchPublicToolTemplates(args?: {
  category?: string
  search?: string
  revalidateSeconds?: number
}): Promise<ToolTemplateModel[]> {
  try {
    const base = getPublicBaseUrl()

    const u = new URL('/api/v1/tool-templates', base)
    if (args?.category) u.searchParams.set('category', args.category)
    // Server expects `query`; keep `search` as an alias for call sites.
    if (args?.search) u.searchParams.set('query', args.search)

    const json = await fetchJson<ApiResponse<ToolTemplateModel[]>>(u.toString(), {
      next: { revalidate: args?.revalidateSeconds ?? 3600, tags: ['public-tool-templates'] },
      headers: { Accept: 'application/json' },
    })
    return Array.isArray(json.data) ? json.data : []
  } catch (e) {
    console.warn('[public-templates] fetchPublicToolTemplates failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

export async function fetchPublicToolTemplatesPage(args: {
  page: number
  limit: number
  category?: string
  query?: string
  requiresApiKey?: boolean
  revalidateSeconds?: number
}): Promise<PaginatedPublicResult<ToolTemplateModel>> {
  try {
    const base = getPublicBaseUrl()
    const page = Number.isFinite(args.page) ? Math.max(1, Math.floor(args.page)) : 1
    const limit = Number.isFinite(args.limit) ? Math.max(1, Math.floor(args.limit)) : 24

    const u = new URL('/api/v1/tool-templates', base)
    u.searchParams.set('page', String(page))
    u.searchParams.set('limit', String(limit))
    if (args.category) u.searchParams.set('category', args.category)
    if (args.query) u.searchParams.set('query', args.query)
    if (args.requiresApiKey !== undefined) u.searchParams.set('requiresApiKey', String(args.requiresApiKey))

    const json = await fetchJson<ApiResponse<ToolTemplateModel[]>>(u.toString(), {
      next: { revalidate: args.revalidateSeconds ?? 3600, tags: ['public-tool-templates'] },
      headers: { Accept: 'application/json' },
    })

    const list = Array.isArray(json.data) ? json.data : []
    const pagination = getPagination(json.meta) ?? { page, limit, total: list.length, has_next: list.length === limit, has_prev: page > 1 }
    return { items: list, pagination }
  } catch (e) {
    console.warn('[public-templates] fetchPublicToolTemplatesPage failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { items: [], pagination: { page: 1, limit: args.limit, total: 0, has_next: false, has_prev: false } }
  }
}

export async function fetchPublicConnectorCatalog(args?: { revalidateSeconds?: number }): Promise<ConnectorCatalogItem[]> {
  try {
    const base = getPublicBaseUrl()
    const u = new URL('/api/v1/connectors/catalog', base)

    const json = await fetchJson<ApiResponse<ConnectorCatalogResponse>>(u.toString(), {
      next: { revalidate: args?.revalidateSeconds ?? 3600, tags: ['public-connector-catalog'] },
      headers: { Accept: 'application/json' },
    })
    const list = (json.data as ConnectorCatalogResponse | undefined)?.connectors
    return Array.isArray(list) ? list : []
  } catch (e) {
    console.warn('[public-templates] fetchPublicConnectorCatalog failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

export async function fetchPublicConnectorCatalogPage(args: {
  page: number
  limit: number
  q?: string
  revalidateSeconds?: number
}): Promise<PaginatedPublicResult<ConnectorCatalogItem>> {
  try {
    const base = getPublicBaseUrl()
    const page = Number.isFinite(args.page) ? Math.max(1, Math.floor(args.page)) : 1
    const limit = Number.isFinite(args.limit) ? Math.max(1, Math.floor(args.limit)) : 24

    const u = new URL('/api/v1/connectors/catalog', base)
    u.searchParams.set('page', String(page))
    u.searchParams.set('limit', String(limit))
    if (args.q) u.searchParams.set('q', args.q)

    const json = await fetchJson<ApiResponse<ConnectorCatalogResponse>>(u.toString(), {
      next: { revalidate: args.revalidateSeconds ?? 3600, tags: ['public-connector-catalog'] },
      headers: { Accept: 'application/json' },
    })
    const list = (json.data as ConnectorCatalogResponse | undefined)?.connectors
    const items = Array.isArray(list) ? list : []
    const pagination = getPagination(json.meta) ?? { page, limit, total: items.length, has_next: items.length === limit, has_prev: page > 1 }
    return { items, pagination }
  } catch (e) {
    console.warn('[public-templates] fetchPublicConnectorCatalogPage failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { items: [], pagination: { page: 1, limit: args.limit, total: 0, has_next: false, has_prev: false } }
  }
}

