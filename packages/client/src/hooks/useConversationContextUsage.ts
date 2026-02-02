import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

/**
 * Mirrors the server's conversation context handling:
 * - The LLM is only given the most recent N persisted messages (currently N=30 on the server)
 * - If there are older messages, the server prepends a synthetic "history fold" system message
 *
 * This hook intentionally measures **message-window utilization** (not lifetime token usage),
 * because lifetime usage is not a proxy for the next-turn prompt context.
 */
export interface ConversationContextUsage {
  /** The message history limit used for this query. */
  limit: number
  /** Number of persisted messages that will be included (bounded by `limit`). */
  messageCount: number
  /** Whether older messages exist before this window. */
  hasMoreBefore: boolean
  /**
   * Effective count of LLM input messages, including the synthetic fold/system message
   * when `hasMoreBefore` is true.
   */
  effectivePromptMessageCount: number
}

export function useConversationContextUsage(conversationId: string | null, opts?: { limit?: number; enabled?: boolean }) {
  const limit = typeof opts?.limit === 'number' && Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 30
  const enabled = Boolean(opts?.enabled ?? true) && Boolean(conversationId)

  return useQuery({
    queryKey: enabled ? (['conversations', conversationId, 'context-usage', { limit }] as const) : (['__noop__'] as const),
    enabled,
    queryFn: async (): Promise<ConversationContextUsage> => {
      const cid = String(conversationId || '')
      const resp = await api.get(`/api/v1/conversations/${encodeURIComponent(cid)}/messages`, { params: { limit } })
      const data = (resp as any)?.data?.data ?? {}
      const messages = Array.isArray((data as any)?.messages) ? ((data as any).messages as unknown[]) : []
      const hasMoreBefore = Boolean((data as any)?.hasMoreBefore)

      const messageCount = messages.length
      const effectivePromptMessageCount = messageCount + (hasMoreBefore ? 1 : 0)

      return { limit, messageCount, hasMoreBefore, effectivePromptMessageCount }
    },
    // This is UX-only; keep it reasonably fresh but avoid constant refetching.
    staleTime: 10_000,
    gcTime: 2 * 60 * 1000,
  })
}

