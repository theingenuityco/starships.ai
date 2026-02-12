import 'server-only'

import type { ApiResponse, AgentTemplateModel, ConnectorCatalogResponse, ConnectorCatalogItem, ToolTemplateModel } from '@starships/protocol'
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

type ExplorePopularResponse = {
  windowDays: number
  agents: AgentTemplateModel[]
  tools: ToolTemplateModel[]
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

export async function fetchPublicToolTemplates(args?: {
  category?: string
  search?: string
  revalidateSeconds?: number
}): Promise<ToolTemplateModel[]> {
  try {
    const base = getPublicBaseUrl()

    const u = new URL('/api/v1/tool-templates', base)
    if (args?.category) u.searchParams.set('category', args.category)
    if (args?.search) u.searchParams.set('search', args.search)

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

export async function fetchPublicExplorePopular(args?: {
  windowDays?: number
  limitAgents?: number
  limitTools?: number
  revalidateSeconds?: number
}): Promise<ExplorePopularResponse> {
  try {
    const base = getPublicBaseUrl()
    const u = new URL('/api/v1/explore/popular', base)
    if (args?.windowDays) u.searchParams.set('windowDays', String(args.windowDays))
    if (args?.limitAgents) u.searchParams.set('limitAgents', String(args.limitAgents))
    if (args?.limitTools) u.searchParams.set('limitTools', String(args.limitTools))

    const json = await fetchJson<ApiResponse<ExplorePopularResponse>>(u.toString(), {
      next: { revalidate: args?.revalidateSeconds ?? 3600, tags: ['public-explore-popular'] },
      headers: { Accept: 'application/json' },
    })

    const data = (json.data as ExplorePopularResponse | undefined) ?? { windowDays: args?.windowDays ?? 30, agents: [], tools: [] }
    // Ensure any avatar URLs embedded in the HTML are reachable from the public origin.
    return {
      ...data,
      agents: Array.isArray(data.agents)
        ? data.agents.map(t => ({
            ...t,
            avatarUrl: absolutizePublicUrl((t as any)?.avatarUrl, base),
          }))
        : [],
      tools: Array.isArray(data.tools) ? data.tools : [],
    }
  } catch (e) {
    console.warn('[public-templates] fetchPublicExplorePopular failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { windowDays: args?.windowDays ?? 30, agents: [], tools: [] }
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

