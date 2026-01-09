import 'server-only'

import type { ApiResponse, AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'
import { getPublicEnvConfig } from '@starships/env/public'

function normalizeBaseUrl(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

function getBackendBaseUrl(): string {
  // Prefer the internal backend URL when available (K8s service / local dev).
  const serverUrl = normalizeBaseUrl(process.env.SERVER_URL || '')
  if (serverUrl) return serverUrl

  // Fallback to the public origin (goes through ingress / proxy).
  const { PUBLIC_URL } = getPublicEnvConfig()
  return normalizeBaseUrl(PUBLIC_URL || 'https://starships.ai')
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
  const base = getBackendBaseUrl()
  const u = new URL('/api/v1/agent-templates', base)
  if (args?.category) u.searchParams.set('category', args.category)
  if (args?.search) u.searchParams.set('search', args.search)

  try {
    const json = await fetchJson<ApiResponse<AgentTemplateModel[]>>(u.toString(), {
      // Match our page ISR window by default.
      next: { revalidate: args?.revalidateSeconds ?? 3600 },
      headers: { Accept: 'application/json' },
    })
    return Array.isArray(json.data) ? json.data : []
  } catch (e) {
    console.warn('[public-templates] fetchPublicAgentTemplates failed', {
      url: u.toString(),
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
  const base = getBackendBaseUrl()
  const u = new URL('/api/v1/tool-templates', base)
  if (args?.category) u.searchParams.set('category', args.category)
  if (args?.search) u.searchParams.set('search', args.search)

  try {
    const json = await fetchJson<ApiResponse<ToolTemplateModel[]>>(u.toString(), {
      next: { revalidate: args?.revalidateSeconds ?? 3600 },
      headers: { Accept: 'application/json' },
    })
    return Array.isArray(json.data) ? json.data : []
  } catch (e) {
    console.warn('[public-templates] fetchPublicToolTemplates failed', {
      url: u.toString(),
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

