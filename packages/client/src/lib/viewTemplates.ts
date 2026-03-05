import { getAtPath } from '@/lib/objectPath'

export type ViewTemplateContext = {
  state: Record<string, unknown>
}

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g

function resolveToken(tokenRaw: string, ctx: ViewTemplateContext): unknown {
  const token = String(tokenRaw || '').trim()
  if (!token) return ''
  if (token.startsWith('state.')) {
    return getAtPath(ctx.state ?? {}, token.slice('state.'.length))
  }
  if (token === 'state') return ctx.state
  // Back-compat: allow bare paths to reference state
  return getAtPath(ctx.state ?? {}, token)
}

export function templateString(input: string, ctx: ViewTemplateContext): string {
  if (!input || typeof input !== 'string') return ''
  if (!input.includes('{{')) return input
  return input.replace(TEMPLATE_RE, (_m, token) => {
    const v = resolveToken(String(token ?? ''), ctx)
    return v === null || v === undefined ? '' : String(v)
  })
}

export function templateDeep<T = unknown>(input: T, ctx: ViewTemplateContext): T {
  if (input === null || input === undefined) return input
  if (typeof input === 'string') return templateString(input, ctx) as unknown as T
  if (Array.isArray(input)) return input.map(v => templateDeep(v, ctx)) as unknown as T
  if (typeof input === 'object') {
    const rec = input as unknown as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rec)) {
      out[k] = templateDeep(v, ctx)
    }
    return out as unknown as T
  }
  return input
}

