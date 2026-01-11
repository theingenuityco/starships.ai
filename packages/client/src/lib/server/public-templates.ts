import 'server-only'

import type { ApiResponse, AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'
import { getPublicEnvConfig } from '@starships/env/public'

function normalizeBaseUrl(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

function getPublicBaseUrl(): string {
  // Public marketing pages should fetch from the *public* origin so the HTML
  // they generate is consistent with what the browser can reach.
  // (Using SERVER_URL can succeed server-side, but the browser may not have the same routing.)
  const { PUBLIC_URL } = getPublicEnvConfig()
  const fromPublicEnv = normalizeBaseUrl(PUBLIC_URL || '')
  if (!fromPublicEnv) {
    // No fallbacks: this must be configured explicitly.
    throw new Error('[public-templates] PUBLIC_URL is required for public marketing ISR fetches')
  }
  return fromPublicEnv
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
      next: { revalidate: args?.revalidateSeconds ?? 3600 },
      headers: { Accept: 'application/json' },
    })
    const list = Array.isArray(json.data) ? json.data : []
    // Ensure any avatar URLs embedded in the HTML are reachable from the public origin.
    return list.map(t => ({
      ...t,
      avatarUrl: absolutizePublicUrl((t as any)?.avatarUrl, base),
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
      next: { revalidate: args?.revalidateSeconds ?? 3600 },
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

