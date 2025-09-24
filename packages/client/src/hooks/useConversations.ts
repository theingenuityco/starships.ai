import api, { getCurrentToken } from '@/lib/api'
import type { ApiResponse, ConversationModel, MessageModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { applyOperation, Operation } from 'fast-json-patch'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useStarshipUIStore } from '@/store/starship-ui-store'

// Import FetchResponse type
interface FetchResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Headers
}

// Extended Message interface for client-side states
interface ClientMessage extends MessageModel {
  sending?: boolean
  streaming?: boolean
  error?: boolean
  chunks?: Array<{
    content: string
    position: number
    timestamp: number
  }>
  // Optional reasoning fields streamed and/or persisted
  reasoning?: string
  reasoningChunks?: Array<{
    content: string
    position: number
    timestamp: number
  }>
}

// Content chunk processing utility
const processChunks = (data: any) => {
  if (!data.messages || !Array.isArray(data.messages)) {
    return data
  }

  const processedMessages = data.messages.map((message: ClientMessage) => {
    // Sanitize tool_calls to keep early tool-first deltas (keep when function.name OR id OR arguments is present)
    const sanitizedToolCalls = Array.isArray((message as any).tool_calls)
      ? (message as any).tool_calls.filter((tc: any) => {
          const fn = (tc as any)?.function
          const hasName = typeof fn?.name === 'string' && fn.name.length > 0
          const hasId = (tc as any)?.id != null && String((tc as any).id).length > 0
          const hasArgs = typeof fn?.arguments === 'string' && fn.arguments.length > 0
          return hasName || hasId || hasArgs
        })
      : undefined

    const hasTextChunks = Array.isArray((message as any).chunks)
    const hasReasoningChunks = Array.isArray((message as any).reasoningChunks)

    if (hasTextChunks || hasReasoningChunks) {
      // Build content from chunks
      let streamedContent = message.content || ''
      if (hasTextChunks) {
        const sortedChunks = [...(message.chunks || [])].sort((a, b) => a.position - b.position)
        streamedContent = ''
        for (const chunk of sortedChunks) streamedContent += chunk.content
      }

      // Build reasoning from chunks
      let streamedReasoning = (message as any).reasoning || ''
      if (hasReasoningChunks) {
        const sortedR = [...(((message as any).reasoningChunks || []) as any[])].sort((a, b) => a.position - b.position)
        streamedReasoning = ''
        for (const rc of sortedR) streamedReasoning += rc.content
      }

      return {
        ...message,
        content: message.streaming && hasTextChunks ? streamedContent : message.content,
        streamedContent,
        ...(streamedReasoning ? { reasoning: message.streaming ? streamedReasoning : (message as any).reasoning } : { reasoning: (message as any).reasoning }),
        ...(sanitizedToolCalls ? { tool_calls: sanitizedToolCalls } : {}),
      } as ClientMessage
    }

    // No chunks case: still ensure tool_calls are sanitized
    return {
      ...message,
      ...(sanitizedToolCalls ? { tool_calls: sanitizedToolCalls } : {}),
    } as ClientMessage
  })

  return {
    ...data,
    messages: processedMessages,
  }
}

// Create message request interface (local definition since it's not in protocol)
interface CreateMessageRequest {
  role: 'user' | 'assistant' | 'system'
  content: string
  conversationId?: string
  agentId?: string
  starshipId?: string
  messageType?: 'user_input' | 'agent_response' | 'system_notification' | 'system_instruction' | 'workflow_output' | 'error'
  stream?: boolean
}

// Streaming state interface
interface StreamingState {
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error'
  isStreaming: boolean
  content: string
  error: any
  lastUpdate?: number
  version?: number
}

// Centralized query keys
export const CONVERSATION_QUERY_KEYS = {
  all: ['conversations'] as const,
  lists: () => [...CONVERSATION_QUERY_KEYS.all, 'list'] as const,
  byStarship: (starshipId: string) => [...CONVERSATION_QUERY_KEYS.all, 'starship', starshipId] as const,
  detail: (id: string) => [...CONVERSATION_QUERY_KEYS.all, 'detail', id] as const,
  messages: (conversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(conversationId), 'messages'] as const,
} as const

/**
 * Unified conversation hook - handles everything conversation-related
 * - Conversation details
 * - Messages (with real-time streaming)
 * - Send message (with streaming support)
 * - All TanStack Query benefits (caching, optimistic updates, etc.)
 */
export function useConversation(conversationId: string | null) {
  const queryClient = useQueryClient()
  const abortControllerRef = useRef<AbortController | null>(null)
  const processingQueueRef = useRef<any[]>([])
  const isProcessingRef = useRef(false)
  const completedRef = useRef(false)
  const shouldRetryRef = useRef(true)

  const [streamingState, setStreamingState] = useState<StreamingState>({
    status: 'idle',
    isStreaming: false,
    content: '',
    error: null,
  })

  // Select zustand actions and read-only selectors without using getState
  const setConversationSnapshot = useStarshipUIStore(s => s.setConversationSnapshot)
  const startStreaming = useStarshipUIStore(s => s.startStreaming)
  const appendStreamingChunk = useStarshipUIStore(s => s.appendStreamingChunk)
  const appendMessageChunk = useStarshipUIStore(s => s.appendMessageChunk)
  const markMessageStreaming = useStarshipUIStore(s => s.markMessageStreaming)
  const updateMessageAt = useStarshipUIStore(s => s.updateMessageAt)
  const endStreaming = useStarshipUIStore(s => s.endStreaming)
  const clearStreaming = useStarshipUIStore(s => s.clearStreaming)
  const setConversationResponding = useStarshipUIStore(s => s.setConversationResponding)
  const appendMessage = useStarshipUIStore(s => s.appendMessage)
  const existingConversation = useStarshipUIStore(s => (conversationId ? s.conversations[conversationId] : undefined))
  // Get conversation messages
  const messagesQuery = useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId!),
    queryFn: async (): Promise<{
      conversationId: string
      messages: ClientMessage[]
      total: number
      participants: string[]
      startedAt: string
      lastActivityAt: string
    }> => {
      const response: FetchResponse<
        ApiResponse<{
          conversationId: string
          messages: MessageModel[]
          total: number
          participants: string[]
          startedAt: string
          lastActivityAt: string
        }>
      > = await api.get(`/api/v1/conversations/${conversationId}/messages`, {
        params: { limit: 100, page: 1, orderBy: 'createdAt', orderDirection: 'asc' },
      })

      return {
        ...response.data.data,
        messages: response.data.data.messages.map((msg: MessageModel) => ({ ...msg }) as ClientMessage),
      }
    },
    enabled: !!conversationId,
    staleTime: 5 * 1000, // 5 seconds - messages change frequently
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })

  // Mirror TanStack cache into Zustand so UI rendering is driven by store
  // IMPORTANT: depend on dataUpdatedAt to avoid infinite loops when Zustand updates trigger re-renders.
  useEffect(() => {
    if (!conversationId) return
    const data = messagesQuery.data as any
    if (!data) return

    try {
      const existing = existingConversation

      // Guard: if reference equal, skip
      if (existing && existing.messages === data.messages) return

      // Guard: if shape unchanged (same length + lastActivityAt), skip
      if (existing && Array.isArray(existing.messages) && Array.isArray(data.messages)) {
        const sameLen = existing.messages.length === data.messages.length
        const sameActivity = existing.lastActivityAt === data.lastActivityAt
        if (sameLen && sameActivity) return
      }

      // Preserve optimistic user messages when syncing from TanStack Query
      let finalMessages = data.messages as any[]

      if (existing && Array.isArray(existing.messages)) {
        // Find any optimistic messages that should be preserved
        const optimisticMessages = existing.messages.filter((msg: any) => {
          if (!msg.sending || !msg.id || !msg.id.startsWith('temp-user-')) {
            return false
          }

          // Only preserve if there's no matching server message with same content
          const hasMatchingServerMessage = data.messages.some((serverMsg: any) => serverMsg.role === 'user' && serverMsg.content === msg.content)

          return !hasMatchingServerMessage
        })

        if (optimisticMessages.length > 0) {
          // Add optimistic messages to the end of the synced messages
          finalMessages = [...data.messages, ...optimisticMessages]
        }
      }

      setConversationSnapshot(conversationId, {
        messages: finalMessages,
        total: finalMessages.length,
        lastActivityAt: data.lastActivityAt,
      })
    } catch {}
  }, [conversationId, messagesQuery.dataUpdatedAt])

  // Process streaming events and update TanStack Query cache
  const handleStreamingEvent = useCallback(
    (data: any) => {
      // Normalize conversation id: prefer event-scoped id, fallback to hook's conversationId
      const cid = (data as any)?.conversationId ?? conversationId
      if (!cid) {
        // Without a resolvable conversation id, we cannot safely route the event
        return
      }
      // JSON Patch events (RFC6902 delta updates)
      // Support both:
      // 1) Batched patches: { type: 'patch', patch: Operation[] }
      // 2) Single op deltas: { op: 'add' | 'replace' | 'remove', path: string, value?: any }
      const isSingleOp = data && typeof data.op === 'string' && typeof data.path === 'string'
      const isPatchArray = data && data.type === 'patch' && Array.isArray(data.patch)

      if (isPatchArray || isSingleOp) {
        const ops: Operation[] = isSingleOp ? [data as Operation] : (data.patch as Operation[])
        const version = (data as any).version

        // Split chunk-add ops from others to avoid blocking event loop with frequent cache writes
        const chunkOps = ops.filter(op => op.op === 'add' && typeof op.path === 'string' && /\/chunks\/-$/.test(op.path))
        const reasoningChunkOps = ops.filter(op => op.op === 'add' && typeof op.path === 'string' && /\/reasoningChunks\/-$/.test(op.path))
        const nonChunkOps = ops.filter(op => !chunkOps.includes(op) && !reasoningChunkOps.includes(op))

        // Fast path: update ephemeral streaming state in zustand for chunk adds
        if (chunkOps.length > 0 || reasoningChunkOps.length > 0) {
          const text = chunkOps
            .map(op => (op as any).value?.content)
            .filter(Boolean)
            .join('')
          // Start streaming when any chunks (text or reasoning) arrive
          startStreaming(cid, version)
          if (text) {
            appendStreamingChunk(cid, text, version)
          }
          // Flip responding off once streaming actually starts
          try {
            setConversationResponding(cid, false)
          } catch {}

          // Also reflect chunk additions in TanStack Query cache so UI renders message content during streaming.
          // We directly mutate the messages cache per op target index rather than applying JSON-Patch (lighter + avoids starvation).
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(cid), (old: any) => {
            if (!old || !Array.isArray(old.messages)) return old
            // Clone shallow containers to keep immutability
            const updated = { ...old, messages: [...old.messages] }

            for (const op of chunkOps) {
              const path = String((op as any).path || '')
              // Expect path like: /messages/{index}/chunks/- where index can be a concrete number or -1 for last
              const match = path.match(/^\/messages\/(-?\d+)\/chunks\/-\s*$/) || path.match(/^\/messages\/(-?\d+)\/chunks\/-$/)
              if (!match) continue
              let msgIndex = Number(match[1])
              if (!Number.isInteger(msgIndex)) continue
              if (msgIndex < 0) {
                // Map -1 sentinel to the last message index
                msgIndex = updated.messages.length - 1
              }
              if (msgIndex < 0 || msgIndex >= updated.messages.length) continue

              const target = { ...updated.messages[msgIndex] }
              const chunkVal = (op as any).value
              // Ensure chunks array
              const chunks = Array.isArray(target.chunks) ? [...target.chunks] : []
              if (chunkVal && typeof chunkVal.content === 'string') {
                chunks.push({
                  content: String(chunkVal.content),
                  position: typeof chunkVal.position === 'number' ? chunkVal.position : chunks.length > 0 ? chunks[chunks.length - 1].position + chunkVal.content.length : 0,
                  timestamp: typeof chunkVal.timestamp === 'number' ? chunkVal.timestamp : Date.now(),
                })
              }
              target.chunks = chunks
              // Ensure streaming flag is true while chunks are arriving
              target.streaming = true
              // Write back
              updated.messages[msgIndex] = target
            }

            // Do not bump lastActivityAt on chunk-only updates to avoid unnecessary re-renders
            return updated
          })

          // Also reflect reasoning chunk additions in TanStack Query cache
          if (reasoningChunkOps.length > 0) {
            queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(cid), (old: any) => {
              if (!old || !Array.isArray(old.messages)) return old
              const updated = { ...old, messages: [...old.messages] }

              for (const op of reasoningChunkOps) {
                const path = String((op as any).path || '')
                // Expect path like: /messages/{index}/reasoningChunks/- where index can be a concrete number or -1 for last
                const match = path.match(/^\/messages\/(-?\d+)\/reasoningChunks\/-\s*$/) || path.match(/^\/messages\/(-?\d+)\/reasoningChunks\/-$/)
                if (!match) continue
                let msgIndex = Number(match[1])
                if (!Number.isInteger(msgIndex)) continue
                if (msgIndex < 0) {
                  msgIndex = updated.messages.length - 1
                }
                if (msgIndex < 0 || msgIndex >= updated.messages.length) continue

                const target = { ...updated.messages[msgIndex] }
                const chunkVal = (op as any).value
                const rChunks = Array.isArray((target as any).reasoningChunks) ? [...(target as any).reasoningChunks] : []
                if (chunkVal && typeof chunkVal.content === 'string') {
                  rChunks.push({
                    content: String(chunkVal.content),
                    position: typeof chunkVal.position === 'number' ? chunkVal.position : rChunks.length > 0 ? rChunks[rChunks.length - 1].position + chunkVal.content.length : 0,
                    timestamp: typeof chunkVal.timestamp === 'number' ? chunkVal.timestamp : Date.now(),
                  })
                }
                ;(target as any).reasoningChunks = rChunks
                target.streaming = true
                updated.messages[msgIndex] = target
              }

              return updated
            })
          }

          // Reflect chunks into Zustand immediately for low-latency rendering (without getState)
          try {
            for (const op of chunkOps) {
              const path = String((op as any).path || '')
              const match = path.match(/^\/messages\/(-?\d+)\/chunks\/-\s*$/) || path.match(/^\/messages\/(-?\d+)\/chunks\/-$/)
              if (!match) continue
              let msgIndex = Number(match[1])
              if (!Number.isInteger(msgIndex)) continue
              if (msgIndex < 0) {
                // Resolve last message index from cache
                const cache: any = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(cid))
                const msgs: any[] = Array.isArray(cache?.messages) ? cache.messages : []
                msgIndex = Math.max(msgs.length - 1, 0)
              }
              const val = (op as any).value || {}
              appendMessageChunk(cid, msgIndex, {
                content: typeof val.content === 'string' ? val.content : '',
                position: typeof val.position === 'number' ? val.position : 0,
                timestamp: typeof val.timestamp === 'number' ? val.timestamp : Date.now(),
              })
              markMessageStreaming(cid, msgIndex, true)
            }
          } catch {}
        }

        // Update local streaming flag for UI consumers (kept for compatibility)
        setStreamingState(prev => ({
          ...prev,
          status: 'streaming',
          isStreaming: true,
          lastUpdate: Date.now(),
          version: version || prev.version,
        }))

        // Apply only non-chunk ops to React Query cache (e.g., add message shell, replace content, mark streaming=false)
        if (nonChunkOps.length > 0) {
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(cid), (old: any) => {
            const applyOps = (target: any) => {
              // Helper: check if a JSON Pointer path exists in current state before applying 'remove'
              const jsonPointerExists = (state: any, pointer: string): boolean => {
                if (typeof pointer !== 'string' || !pointer.startsWith('/')) return false
                // Split pointer and unescape tokens (~1 -> /, ~0 -> ~)
                const tokens = pointer
                  .split('/')
                  .slice(1)
                  .map(t => t.replace(/~1/g, '/').replace(/~0/g, '~'))

                // Traverse to parent of the last token
                let node: any = state
                for (let i = 0; i < tokens.length - 1; i++) {
                  const key = tokens[i]
                  if (Array.isArray(node)) {
                    const idx = Number(key)
                    if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) return false
                    node = node[idx]
                  } else if (node && typeof node === 'object') {
                    if (!(key in node)) return false
                    node = node[key]
                  } else {
                    return false
                  }
                }

                // At parent, check existence of last key/index
                const last = tokens[tokens.length - 1]
                if (Array.isArray(node)) {
                  const idx = Number(last)
                  return Number.isInteger(idx) && idx >= 0 && idx < node.length
                } else if (node && typeof node === 'object') {
                  return last in node
                }
                return false
              }

              let result = target
              for (const rawOp of nonChunkOps) {
                // Translate '/messages/-1/...' to the current last index before applying each op
                let operation = rawOp as Operation
                if (typeof (operation as any).path === 'string') {
                  const p = String((operation as any).path)
                  if (p.startsWith('/messages/-1')) {
                    const msgs = Array.isArray((result as any)?.messages) ? (result as any).messages : []
                    const lastIdx = Math.max(msgs.length - 1, 0)
                    operation = { ...(operation as any), path: p.replace('/messages/-1', `/messages/${lastIdx}`) } as Operation
                  }
                }

                // Skip 'remove' if path no longer exists (can happen if another op replaced the whole node)
                if ((operation as any).op === 'remove' && typeof (operation as any).path === 'string') {
                  const exists = jsonPointerExists(result, (operation as any).path as string)
                  if (!exists) {
                    // Silently ignore to avoid OPERATION_PATH_UNRESOLVABLE noise during racing ops
                    continue
                  }
                }

                try {
                  const opResult = applyOperation(result, operation as Operation, true)
                  result = opResult.newDocument
                } catch (opErr) {
                  console.warn('[STREAMING] Operation failed, continuing with others:', operation, opErr)
                }
              }
              return result
            }
            if (!old) {
              // Initialize with empty messages array if no data exists
              const initialData = { messages: [], total: 0, conversationId: cid }
              try {
                const patched = applyOps(initialData)
                const updatedData = {
                  ...patched,
                  total: Array.isArray(patched.messages) ? patched.messages.length : 0,
                }

                return processChunks(updatedData)
              } catch (error) {
                console.error('[STREAMING] Failed to apply operations to initial data:', error)
                return initialData
              }
            }

            // Apply operations to existing data
            try {
              const patched = applyOps(old)
              const updatedData = {
                ...patched,
                total: Array.isArray(patched.messages) ? patched.messages.length : old.total,
                lastActivityAt: new Date().toISOString(),
              }

              return processChunks(updatedData)
            } catch (error) {
              console.error('[STREAMING] Failed to apply operations:', error, { operations: nonChunkOps, target: old })
              return old // Return unchanged data on operation failure
            }
          })

          // Mirror critical non-chunk ops into Zustand for immediate UI updates (tool-first shells, tool_calls)
          try {
            const cache: any = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(cid))
            const msgs: any[] = Array.isArray(cache?.messages) ? cache.messages : []
            for (const op of nonChunkOps) {
              if (typeof (op as any).path !== 'string') continue
              const path = String((op as any).path)

              // Append assistant shell when server adds message at a concrete index
              if ((op as any).op === 'add') {
                const mAdd = path.match(/^\/messages\/(\d+)$/)
                if (mAdd) {
                  const value = (op as any).value
                  if (value && value.role === 'assistant') {
                    try {
                      const zConvo = useStarshipUIStore.getState().conversations[cid]
                      const zMsgs = Array.isArray(zConvo?.messages) ? zConvo.messages : []
                      if (!zMsgs.some((m: any) => m.id === value.id)) {
                        appendMessage(cid, { ...(value as any) })
                      }
                    } catch {}
                  }
                }
              }

              // Update tool_calls on the current assistant placeholder (or concrete index)
              const mTc = path.match(/^\/messages\/(-?\d+)\/tool_calls$/)
              if (mTc && (op as any).op === 'replace') {
                let idx = Number(mTc[1])
                if (!Number.isInteger(idx)) continue
                if (idx < 0) {
                  idx = Math.max(msgs.length - 1, 0)
                }
                const raw = (op as any).value || []
                const sanitized = Array.isArray(raw)
                  ? raw.filter((tc: any) => {
                      const fn = tc?.function
                      const hasName = typeof fn?.name === 'string' && fn.name.length > 0
                      const hasId = tc?.id != null && String(tc.id).length > 0
                      const hasArgs = typeof fn?.arguments === 'string' && fn.arguments.length > 0
                      return hasName || hasId || hasArgs
                    })
                  : []
                try {
                  updateMessageAt(cid, idx, (m: any) => ({ ...m, tool_calls: sanitized }))
                } catch {}
              }
            }
          } catch {}

          // Identify message indices that completed (either content replaced or streaming=false)
          const completedIdxs = new Set<number>()
          for (const op of nonChunkOps) {
            if (op.op === 'replace' && typeof (op as any).path === 'string') {
              const p = String((op as any).path)
              const mStreaming = p.match(/^\/messages\/(-?\d+)\/streaming$/)
              const mContent = p.match(/^\/messages\/(-?\d+)\/content$/)
              // Resolve -1 sentinel to last index against current cache
              const resolveIndex = (idx: number) => {
                if (idx >= 0) return idx
                const cache: any = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(cid))
                const len = Array.isArray(cache?.messages) ? cache.messages.length : 0
                return Math.max(len - 1, 0)
              }
              if (mStreaming && (op as any).value === false) {
                completedIdxs.add(resolveIndex(Number(mStreaming[1])))
              }
              if (mContent) {
                completedIdxs.add(resolveIndex(Number(mContent[1])))
              }
            }
          }

          // If any op marks streaming complete, end zustand streaming
          const marksDone =
            nonChunkOps.some(op => op.op === 'replace' && typeof op.path === 'string' && /\/streaming$/.test(op.path) && (op as any).value === false) ||
            nonChunkOps.some(op => op.op === 'replace' && typeof op.path === 'string' && /\/content$/.test(op.path))
          if (marksDone) {
            endStreaming(cid)
            // Also ensure store cleanup for the event's conversation if provided
            try {
              if ((data as any)?.conversationId) {
                endStreaming((data as any).conversationId as string)
              }
            } catch {}
            // Reflect completion in local streaming state to re-enable input
            setStreamingState(prev => ({
              ...prev,
              status: 'complete',
              isStreaming: false,
              content: '',
              lastUpdate: Date.now(),
            }))

            // Ensure message-level streaming flags are cleared in the UI store
            if (completedIdxs.size > 0) {
              try {
                for (const idx of completedIdxs) {
                  markMessageStreaming(cid, idx, false)
                  // Preserve chunks if final content wasn't persisted; they'll be used for display fallback.
                  updateMessageAt(cid, idx, (m: any) => {
                    const hasFinal = typeof m.content === 'string' && m.content.trim().length > 0
                    return hasFinal ? { ...m, streaming: false, chunks: undefined } : { ...m, streaming: false }
                  })
                }
              } catch {}
            }

            // Optionally clear ephemeral state shortly after completion
            setTimeout(() => clearStreaming(cid), 500)
            if ((data as any)?.conversationId) {
              setTimeout(() => {
                try {
                  clearStreaming((data as any).conversationId as string)
                } catch {}
              }, 500)
            }
          }
        }

        return
      }

      // Handle completion by SSE event name
      if (data && (data as any).__event === 'complete') {
        const scope = (data as any).scope || 'workflow'

        // Mark streaming finished for the current turn/workflow
        setStreamingState(prev => ({
          ...prev,
          status: 'complete',
          isStreaming: false,
          content: '',
          lastUpdate: Date.now(),
        }))
        try {
          endStreaming(cid)
        } catch {}
        try {
          if ((data as any)?.conversationId) {
            endStreaming((data as any).conversationId as string)
          }
        } catch {}

        // Also mark the last streaming message as complete in the UI store
        try {
          const cache: any = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(cid))
          const msgs: any[] = Array.isArray(cache?.messages) ? cache.messages : []
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i]?.streaming === true) {
              markMessageStreaming(cid, i, false)
              updateMessageAt(cid, i, (m: any) => {
                const hasFinal = typeof m.content === 'string' && m.content.trim().length > 0
                return hasFinal ? { ...m, streaming: false, chunks: undefined } : { ...m, streaming: false }
              })
              break
            }
          }
        } catch {}

        // Clear ephemeral streaming state shortly after completion
        setTimeout(() => {
          try {
            clearStreaming(cid)
          } catch {}
        }, 500)
        if ((data as any)?.conversationId) {
          setTimeout(() => {
            try {
              clearStreaming((data as any).conversationId as string)
            } catch {}
          }, 500)
        }

        if (scope === 'workflow') {
          // Only hard-stop the SSE client for full workflow completion
          completedRef.current = true
          shouldRetryRef.current = false
          if (abortControllerRef.current) {
            try {
              abortControllerRef.current.abort()
            } catch {}
            abortControllerRef.current = null
          }
        }
        return
      }

      // Complete message objects
      if (data.role !== undefined) {
        const message = data as ClientMessage

        // Empty assistant message - start streaming
        if (message.role === 'assistant' && (!message.content || message.content.trim() === '')) {
          setStreamingState(prev => ({
            ...prev,
            status: 'streaming',
            isStreaming: true,
            content: '', // Clear any previous streaming content
            lastUpdate: Date.now(),
          }))
          try {
            startStreaming(cid)
            // Ensure responding indicator is cleared when assistant stream begins
            setConversationResponding(cid, false)
          } catch {}

          // Add streaming message to cache (append; ascending order)
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(cid), (old: any) => {
            let next: any
            if (!old) {
              next = { messages: [{ ...message, streaming: true }], total: 1, conversationId: cid }
            } else {
              next = {
                ...old,
                messages: [...old.messages, { ...message, streaming: true }],
                total: old.total + 1,
              }
            }

            return next
          })
          return
        }

        // Regular message - add to cache (append; ascending order, with de-duplication)
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(cid), (old: any) => {
          if (!old) return { messages: [message], total: 1, conversationId: cid }

          // Dedupe by message id if already present (prevents duplicates when SSE replays existing messages)
          if (message.id && Array.isArray(old.messages) && old.messages.some((m: any) => m.id === message.id)) {
            return old
          }

          // Check if this is a user message that should replace an optimistic message
          const isUserMessage = message.role === 'user'
          let messages = [...old.messages]

          if (isUserMessage) {
            // Find and replace any optimistic user message with similar content and sending=true
            const optimisticIndex = messages.findIndex(msg => msg.role === 'user' && msg.sending === true && msg.content === message.content && msg.id && msg.id.startsWith('temp-user-'))

            if (optimisticIndex !== -1) {
              // Replace optimistic message with real server message
              messages[optimisticIndex] = { ...message, sending: false }
              return {
                ...old,
                messages,
                total: messages.length,
              }
            }
          }

          // No optimistic message found, append normally
          return {
            ...old,
            messages: [...messages, message],
            total: old.total + 1,
          }
        })
        return
      }

      // Complete event
      if (data.status === 'complete' || data.type === 'done') {
        setStreamingState(prev => ({
          ...prev,
          status: 'complete',
          isStreaming: false,
          content: '', // Clear streaming content on completion
        }))

        // Mark streaming messages as complete in React Query cache
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(cid), (old: any) => {
          if (!old) return old
          return {
            ...old,
            messages: old.messages.map((msg: ClientMessage) => (msg.streaming ? { ...msg, streaming: false, processingStatus: 'completed' } : msg)),
          }
        })

        // Also clear UI store streaming flags for the last streaming message
        try {
          const cache: any = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(cid))
          const msgs: any[] = Array.isArray(cache?.messages) ? cache.messages : []
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i]?.streaming === true) {
              markMessageStreaming(cid, i, false)
              updateMessageAt(cid, i, (m: any) => {
                const hasFinal = typeof m.content === 'string' && m.content.trim().length > 0
                return hasFinal ? { ...m, streaming: false, chunks: undefined } : { ...m, streaming: false }
              })
              break
            }
          }
        } catch {}

        // End ephemeral streaming state so the input re-enables
        try {
          endStreaming(cid)
        } catch {}
        try {
          if ((data as any)?.conversationId) {
            endStreaming((data as any).conversationId as string)
          }
        } catch {}
        setTimeout(() => {
          try {
            clearStreaming(cid)
          } catch {}
        }, 500)
        if ((data as any)?.conversationId) {
          setTimeout(() => {
            try {
              clearStreaming((data as any).conversationId as string)
            } catch {}
          }, 500)
        }
        // Mark complete and hard-stop the SSE client to avoid POST retries
        completedRef.current = true
        shouldRetryRef.current = false
        if (abortControllerRef.current) {
          try {
            abortControllerRef.current.abort()
          } catch {}
          abortControllerRef.current = null
        }

        return
      }

      // Error event
      if (data.errorCode !== undefined) {
        setStreamingState(prev => ({
          ...prev,
          status: 'error',
          error: data,
          isStreaming: false,
        }))
        return
      }
    },
    [conversationId, queryClient]
  )

  /**
   * Process queued events with yielding to prevent blocking
   */
  const processEventQueue = useCallback(async () => {
    if (isProcessingRef.current || processingQueueRef.current.length === 0) {
      return
    }

    isProcessingRef.current = true

    while (processingQueueRef.current.length > 0) {
      const data = processingQueueRef.current.shift()

      try {
        // Process the event
        handleStreamingEvent(data)

        // Yield once per animation frame for snappier streaming without batching too many chunks
        await new Promise(resolve => {
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => resolve(undefined))
          } else {
            setTimeout(resolve, 0)
          }
        })
      } catch (error) {
        console.error('[STREAMING] Error processing event:', error)
      }
    }

    isProcessingRef.current = false
  }, [handleStreamingEvent])

  /**
   * Queue an event for processing
   */
  const queueEvent = useCallback(
    (event: any) => {
      processingQueueRef.current.push(event)
      processEventQueue()
    },
    [processEventQueue]
  )

  // Send message mutation with streaming support
  const sendMessageMutation = useMutation({
    mutationFn: async (
      data: CreateMessageRequest & {
        stream?: boolean
      }
    ): Promise<ClientMessage> => {
      if (data.stream) {
        // Use a single, long-polling GET SSE channel per send; POST only kicks off processing
        const token = await getCurrentToken()
        if (!token) {
          throw new Error('No authentication token available')
        }

        // Stop any existing stream
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        // Create new abort controller
        abortControllerRef.current = new AbortController()

        // Reset retry/completion flags to allow retries only while actively streaming
        completedRef.current = false
        shouldRetryRef.current = true

        return new Promise((resolve, reject) => {
          let resolved = false

          // Clear previous state
          processingQueueRef.current = []
          setStreamingState({
            status: 'connecting',
            isStreaming: true,
            content: '',
            error: null,
            lastUpdate: Date.now(),
          })

          // Compute baseline length to help the server emit concrete numeric indexes
          const baselineCache = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(data.conversationId!)) as any
          const messagesSnapshot = Array.isArray(baselineCache?.messages) ? baselineCache.messages : []
          const optimisticCount = messagesSnapshot.filter((m: any) => m?.sending === true).length
          const baselineLength = Math.max(messagesSnapshot.length - optimisticCount, 0)

          // Start GET SSE subscription for this conversation
          fetchEventSource(`/api/v1/conversations/${data.conversationId}/messages?stream=true&baselineLength=${baselineLength}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: abortControllerRef.current?.signal,
            openWhenHidden: true,
            async onopen(response) {
              if (response.ok) {
                setStreamingState(prev => ({
                  ...prev,
                  status: 'streaming',
                }))
                return // Continue processing
              } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                // Client error - don't retry
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
              } else {
                // Server error or rate limit - let it retry
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
              }
            },
            onmessage(event) {
              // Queue events for non-blocking processing
              try {
                if (!event.data) return

                const parsed = JSON.parse(event.data)
                const eventType = (event as any).event || null

                // Attach conversationId for reliable routing and queue the event
                queueEvent({ ...parsed, __event: eventType, conversationId: data.conversationId })
              } catch (parseError) {
                console.warn('[STREAMING] Failed to parse SSE data:', event.data, parseError)
              }
            },
            onclose() {
              // Mark as completed and prevent retries
              completedRef.current = true
              shouldRetryRef.current = false
              // Abort and clear controller to stop any reconnection attempts
              if (abortControllerRef.current) {
                try {
                  abortControllerRef.current.abort()
                } catch {}
                abortControllerRef.current = null
              }

              // Ensure streaming state is reset on close
              setStreamingState(prev => ({
                ...prev,
                status: 'complete',
                isStreaming: false,
                content: '',
                lastUpdate: Date.now(),
              }))
              try {
                endStreaming(data.conversationId!)
              } catch {}

              // Also mark the last streaming message as complete in the UI store
              try {
                const cache: any = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(data.conversationId!))
                const msgs: any[] = Array.isArray(cache?.messages) ? cache.messages : []
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i]?.streaming === true) {
                    markMessageStreaming(data.conversationId!, i, false)
                    updateMessageAt(data.conversationId!, i, (m: any) => {
                      const hasFinal = typeof m.content === 'string' && m.content.trim().length > 0
                      return hasFinal ? { ...m, streaming: false, chunks: undefined } : { ...m, streaming: false }
                    })
                    break
                  }
                }
              } catch {}

              setTimeout(() => {
                try {
                  clearStreaming(data.conversationId!)
                } catch {}
              }, 300)

              if (!resolved) {
                resolved = true
                resolve({
                  id: `user-${Date.now()}`,
                  role: data.role,
                  content: data.content,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  messageType: data.messageType || 'user_input',
                } as ClientMessage)
              }
            },
            onerror(error) {
              console.error('[STREAMING] Connection error:', error)
              // If aborted or completed, suppress retries
              if (abortControllerRef.current?.signal.aborted || completedRef.current || !shouldRetryRef.current) {
                return
              }
              if (!resolved) {
                resolved = true
                reject(error)
              }
              // Throw to allow retry while actively streaming
              throw error
            },
          }).catch(error => {
            if (!resolved) {
              resolved = true
              reject(error)
            }
          })

          // Kick off processing asynchronously via POST (no SSE on this request)
          api
            .post(`/api/v1/conversations/${data.conversationId}/messages`, {
              content: data.content,
            })
            .catch(err => {
              console.error('[STREAMING] Failed to start conversation processing:', err)
              // Stop SSE subscription on failure
              if (abortControllerRef.current) {
                try {
                  abortControllerRef.current.abort()
                } catch {}
                abortControllerRef.current = null
              }
              if (!resolved) {
                resolved = true
                reject(err)
              }
            })
        })
      } else {
        // Regular message creation
        const response: FetchResponse<ApiResponse<MessageModel>> = await api.post('/api/v1/messages', data)
        return response.data.data as ClientMessage
      }
    },
    onMutate: async variables => {
      if (!variables.conversationId) return

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: CONVERSATION_QUERY_KEYS.messages(variables.conversationId),
      })

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId))

      // Do NOT optimistically add the user message when streaming; rely on server deltas
      if (variables.stream) {
        return { previousMessages, conversationId: variables.conversationId }
      }

      // Optimistically add the user message for non-streaming requests (append; ascending order)
      const tempMessage: ClientMessage = {
        id: `temp-${Date.now()}`,
        role: variables.role,
        content: variables.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageType: variables.messageType || 'user_input',
        sending: true,
      }

      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), (old: any) => {
        if (!old) return { messages: [tempMessage], total: 1, conversationId: variables.conversationId }
        return {
          ...old,
          messages: [...old.messages, tempMessage],
          total: old.total + 1,
        }
      })

      return { previousMessages, tempMessage, conversationId: variables.conversationId }
    },
    onSuccess: (result, variables, context) => {
      if (!variables.conversationId || !context) return

      if (!variables.stream) {
        // Replace temp message with real message (non-streaming)
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), (old: any) => {
          if (!old) return { messages: [result], total: 1, conversationId: variables.conversationId }

          const tempId = (context as any).tempMessage?.id
          const messages = old.messages.map((msg: ClientMessage) => (tempId && msg.id === tempId ? { ...result, sending: false } : msg))

          return {
            ...old,
            messages,
            lastActivityAt: result.createdAt,
          }
        })
      } else {
        // Streaming path uses server-sent deltas; no optimistic message to reconcile.
      }
    },
    onError: (error: any, variables, context) => {
      if (!variables.conversationId || !context) return

      // Rollback optimistic update
      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), context.previousMessages)

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to send message'
      toast.error('Failed to send message', {
        description: errorMessage,
      })
    },
  })

  return {
    // Query data
    messages: messagesQuery.data?.messages || [],
    total: messagesQuery.data?.total || 0,
    participants: messagesQuery.data?.participants || [],
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,

    // Streaming state
    streamingState,
    isStreaming: streamingState.isStreaming,
    streamingContent: streamingState.content,

    // Actions
    sendMessage: (data: CreateMessageRequest & { stream?: boolean }) => sendMessageMutation.mutateAsync(data),
    isSending: sendMessageMutation.isPending,

    // Utilities
    refetch: messagesQuery.refetch,
    invalidate: () =>
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId!),
      }),
  }
}

// Additional conversation management hooks (kept from useConversations.ts)
export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { title?: string; starshipId?: string; agentId?: string }): Promise<ConversationModel> => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.post('/api/v1/conversations', data)
      return response.data.data
    },
    onSuccess: (conversation, variables) => {
      // Invalidate starship conversations list
      if (variables.starshipId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byStarship(variables.starshipId),
        })
      }
      toast.success('New conversation created successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create conversation'
      toast.error('Failed to create conversation', {
        description: errorMessage,
      })
    },
  })
}

export function useStarshipConversations(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<{ conversations: ConversationModel[] }> => {
      const response: FetchResponse<ApiResponse<ConversationModel[]>> = await api.get(`/api/v1/starships/${starshipId}/conversations`)
      return { conversations: response.data.data }
    },
    enabled: !!starshipId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Delete conversation
export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/conversations/${conversationId}`)
      return response.data.data
    },
    onMutate: async conversationId => {
      // Get conversation details to know which starship it belongs to
      const conversationData = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.detail(conversationId)) as any
      const starshipId = conversationData?.conversation?.starshipId

      // Cancel any outgoing refetches
      if (starshipId) {
        await queryClient.cancelQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId) })
      }

      // Snapshot the previous conversations
      const previousConversations = starshipId ? queryClient.getQueryData(CONVERSATION_QUERY_KEYS.byStarship(starshipId)) : null

      // Optimistically remove the conversation
      if (starshipId) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.byStarship(starshipId), (old: { conversations: ConversationModel[] } | undefined) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.filter((conversation: ConversationModel) => conversation.id !== conversationId),
          }
        })
      }

      return { previousConversations, conversationId, starshipId }
    },
    onError: (error: any, conversationId, context) => {
      // Rollback the optimistic update
      if (context?.previousConversations && context.starshipId) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.byStarship(context.starshipId), context.previousConversations)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete conversation'
      toast.error('Failed to delete conversation', {
        description: errorMessage,
      })
    },
    onSuccess: (data, conversationId, context) => {
      // Remove the conversation from all caches
      queryClient.removeQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId) })
      queryClient.removeQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })

      toast.success('Conversation deleted successfully!')
    },
    onSettled: (data, error, conversationId, context) => {
      // Always refetch to ensure consistency
      if (context?.starshipId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byStarship(context.starshipId),
        })
      }
    },
  })
}

// Delete message
export function useDeleteMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/messages/${messageId}`)
      return response.data.data
    },
    onMutate: async messageId => {
      // Since MessageModel no longer has conversationId, we need to find it from the messages cache
      // This is not ideal but necessary with the current simplified model
      return { messageId }
    },
    onSuccess: (data, messageId, context) => {
      // Invalidate all message queries to ensure consistency
      // This is less efficient but necessary without conversationId on messages
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.all,
      })
      toast.success('Message deleted successfully!')
    },
    onError: (error: any, messageId, context) => {
      // Invalidate all message queries to ensure consistency
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.all,
      })

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete message'
      toast.error('Failed to delete message', {
        description: errorMessage,
      })
    },
  })
}

// Get conversation agents (for agent restoration on refresh)
export function useConversationAgents(conversationId: string | null) {
  return useQuery({
    queryKey: [...CONVERSATION_QUERY_KEYS.messages(conversationId!), 'agents'],
    queryFn: async (): Promise<any[]> => {
      const response: FetchResponse<any> = await api.get(`/api/v1/conversations/${conversationId}/messages`, {
        params: { limit: 1, page: 1 }, // We only need agents, not all messages
      })
      return response.data.data.agents || []
    },
    enabled: !!conversationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Update conversation status
export function useUpdateConversationStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { conversationId: string; status: 'active' | 'paused' | 'completed' | 'archived' }) => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.patch(`/api/v1/conversations/${data.conversationId}/status`, {
        status: data.status,
      })
      return response.data.data
    },
    onSuccess: (updatedConversation, variables) => {
      // Update the conversation in cache
      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.detail(variables.conversationId), (old: any) => {
        if (!old) return old
        return {
          ...old,
          conversation: updatedConversation,
        }
      })

      // Invalidate related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(variables.conversationId) })

      toast.success(`Conversation ${variables.status} successfully!`)
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update conversation status'
      toast.error('Failed to update status', {
        description: errorMessage,
      })
    },
  })
}
