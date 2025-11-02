'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { AGENT_QUERY_KEYS, fetchAgentBySlugOrId } from '@/hooks/useAgents'

/**
 * Detects agent creations during an active streaming turn and exposes a modal state
 * that opens only after the turn completes.
 *
 * Detection heuristic: assistant tool call named like 'open-agent*' with a provided name and no slug.
 */
export function useDeferredAgentCreationModal(options: {
  liveMessages: any[] | undefined
  isStreaming: boolean | undefined
  starshipSlug?: string | null
  conversationId?: string | null
  agents?: Array<{ name?: string; slug?: string }>
  setLeadingMentionAgent?: (agent: { id?: string; name?: string; slug?: string }, afterText?: string) => void
  focusInput?: () => void
}) {
  const isStreaming = Boolean(options?.isStreaming)
  const liveMessages = Array.isArray(options?.liveMessages) ? (options!.liveMessages as any[]) : []
  const starshipSlug = typeof options?.starshipSlug === 'string' ? options!.starshipSlug : undefined
  const conversationId = typeof options?.conversationId === 'string' ? options!.conversationId : undefined
  const agents = Array.isArray(options?.agents) ? options!.agents : undefined
  const setLeadingMentionAgent = typeof options?.setLeadingMentionAgent === 'function' ? options!.setLeadingMentionAgent : undefined
  const focusInput = typeof options?.focusInput === 'function' ? options!.focusInput : undefined
  const router = useRouter()
  const queryClient = useQueryClient()

  const prevStreamingRef = useRef<boolean>(false)
  const createdSlugsRef = useRef<Set<string>>(new Set())
  const createdNamesRef = useRef<Set<string>>(new Set())
  const turnStartIndexRef = useRef<number>(0)
  const agentCreationCallIdsRef = useRef<Set<string>>(new Set())
  // Track all agent-related tool call ids (open/edit) regardless of whether slug was present initially
  const agentRelatedCallIdsRef = useRef<Set<string>>(new Set())

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [createdNames, setCreatedNames] = useState<string[]>([])
  const [createdAgents, setCreatedAgents] = useState<any[]>([])
  const [createdSlugs, setCreatedSlugs] = useState<string[]>([])

  // Persist modal payload across route replaces within the same conversation turn
  const persistModalPayload = useCallback(
    (payload: { slugs: string[]; names: string[] }) => {
      try {
        if (!conversationId) return
        const key = `agentCreatedModal:${conversationId}`
        const data = { ...payload, ts: Date.now() }
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(key, JSON.stringify(data))
        }
      } catch {}
    },
    [conversationId]
  )

  const consumePersistedPayloadIfAny = useCallback(() => {
    try {
      if (!conversationId) return null
      const key = `agentCreatedModal:${conversationId}`
      if (typeof window === 'undefined' || !window.sessionStorage) return null
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { slugs?: string[]; names?: string[]; ts?: number }
      // Only accept very recent payloads (within 20 seconds)
      if (typeof parsed?.ts === 'number' && Date.now() - parsed.ts > 20_000) {
        window.sessionStorage.removeItem(key)
        return null
      }
      window.sessionStorage.removeItem(key)
      return { slugs: Array.isArray(parsed?.slugs) ? parsed!.slugs : [], names: Array.isArray(parsed?.names) ? parsed!.names : [] }
    } catch {
      return null
    }
  }, [conversationId])

  // While streaming, track agent-creation candidate call ids (assistant calls without slug)
  useEffect(() => {
    if (!isStreaming || !liveMessages.length) return

    // Only process messages that arrived during this streaming turn
    // Include the last message that may receive in-place updates (e.g., toolCalls replacement)
    const startIndex = Math.max(0, Math.min(turnStartIndexRef.current, liveMessages.length - 1))
    const recent = liveMessages.slice(startIndex)
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i] as any
      if (!msg) continue
      // Assistant tool call arguments may indicate creation when slug missing
      if (msg.role === 'assistant' && Array.isArray((msg as any).toolCalls)) {
        for (const tc of (msg as any).toolCalls as any[]) {
          const rawName = tc?.function?.name as string | undefined
          const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
          // Only consider AGENT-related calls
          if (!fnName || (!fnName.includes('open-agent') && !fnName.includes('open agent') && !fnName.includes('edit-agent') && !fnName.includes('edit agent'))) continue
          let args: any = tc?.function?.arguments
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args)
            } catch {}
          }
          // Normalize common nested shapes
          const src = args && typeof args === 'object' ? (args as any) : undefined
          const nested = src?.agent || src?.data || src?.payload || src
          const nestedSlug = nested && typeof nested.slug === 'string' && nested.slug.trim() ? String(nested.slug) : undefined
          const altAgentSlug = typeof src?.agentSlug === 'string' && src.agentSlug.trim() ? String(src.agentSlug) : undefined
          const slug = nestedSlug || altAgentSlug || null
          const maybeName = nested && typeof nested.name === 'string' && nested.name.trim() ? String(nested.name) : undefined
          const callId = typeof (tc as any)?.id === 'string' ? String((tc as any).id) : undefined
          if (callId) agentRelatedCallIdsRef.current.add(callId)
          if (!slug && callId) agentCreationCallIdsRef.current.add(callId)
          // While streaming, if we have a name but no slug yet, memoize the name (creation mode hint)
          if (!slug && maybeName) {
            createdNamesRef.current.add(maybeName)
          }
        }
      }
    }
  }, [isStreaming, liveMessages])

  // When streaming starts/ends, manage per-turn state and open the modal on end
  useEffect(() => {
    const was = prevStreamingRef.current
    // Turn started: reset per-turn tracking and mark the current message index
    if (!was && isStreaming) {
      createdSlugsRef.current.clear()
      createdNamesRef.current.clear()
      agentCreationCallIdsRef.current.clear()
      agentRelatedCallIdsRef.current.clear()
      setCreatedSlugs([])
      setCreatedAgents([])
      setCreatedNames([])
      // Include the last existing message since it may receive in-place updates (toolCalls)
      // Include the last existing message since it may receive in-place updates (toolCalls)
      turnStartIndexRef.current = Math.max(0, liveMessages.length - 1)
    }
    // Turn ended: finalize and open modal if anything was created (agent-related only)
    if (was && !isStreaming) {
      // Fallback: some toolCalls may land right at the end; scan messages since turn start
      try {
        const startIndex = Math.max(0, Math.min(turnStartIndexRef.current, liveMessages.length))
        for (let i = startIndex; i < liveMessages.length; i++) {
          const msg: any = liveMessages[i]
          if (!msg) continue
          if (msg.role === 'assistant' && Array.isArray((msg as any).toolCalls)) {
            for (const tc of (msg as any).toolCalls as any[]) {
              const rawName = tc?.function?.name as string | undefined
              const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
              // Only consider AGENT-related calls
              if (!fnName || (!fnName.includes('open-agent') && !fnName.includes('open agent') && !fnName.includes('edit-agent') && !fnName.includes('edit agent'))) continue
              let args: any = tc?.function?.arguments
              if (typeof args === 'string') {
                try {
                  args = JSON.parse(args)
                } catch {}
              }
              // Normalize common nested shapes
              const src = args && typeof args === 'object' ? (args as any) : undefined
              const nested = src?.agent || src?.data || src?.payload || src
              const nestedSlug = nested && typeof nested.slug === 'string' && nested.slug.trim() ? String(nested.slug) : undefined
              const altAgentSlug = typeof src?.agentSlug === 'string' && src.agentSlug.trim() ? String(src.agentSlug) : undefined
              const slug = nestedSlug || altAgentSlug || null
              const maybeName = nested && typeof nested.name === 'string' && nested.name.trim() ? String(nested.name) : undefined
              const callId = typeof (tc as any)?.id === 'string' ? String((tc as any).id) : undefined
              if (!slug && callId) {
                // Mark as creation candidate when slug is not provided yet
                agentCreationCallIdsRef.current.add(callId)
              } else if (slug && callId && (agentCreationCallIdsRef.current.has(callId) || agentRelatedCallIdsRef.current.has(callId))) {
                // If slug is present (either now or from start) and call is agent-related, capture it
                createdSlugsRef.current.add(slug)
              } else if (!slug && callId && agentCreationCallIdsRef.current.has(callId)) {
                // Fallback: derive slug from function name suffix: open-agent-<slug> / edit-agent-<slug>
                if (fnName.startsWith('open-agent-')) {
                  const suffix = fnName.slice('open-agent-'.length)
                  if (suffix) createdSlugsRef.current.add(suffix)
                } else if (fnName.startsWith('edit-agent-')) {
                  const suffix = fnName.slice('edit-agent-'.length)
                  if (suffix) createdSlugsRef.current.add(suffix)
                }
              }
              // Record name hints when present and slug still unknown (creation mode)
              if (!slug && maybeName) {
                createdNamesRef.current.add(maybeName)
              }
            }
          }
          if (msg.role === 'tool' && msg.toolCallId) {
            const idStr = String(msg.toolCallId)
            const inTrackedSets = agentCreationCallIdsRef.current.has(idStr) || agentRelatedCallIdsRef.current.has(idStr)
            // Fallback: if not tracked (e.g., assistant call occurred before mount), verify by resolving assistant call anywhere in the message list
            let isAgentRelatedTool = inTrackedSets
            if (!isAgentRelatedTool) {
              try {
                for (let j = liveMessages.length - 1; j >= 0; j--) {
                  const am = liveMessages[j] as any
                  if (am?.role !== 'assistant' || !Array.isArray(am?.toolCalls)) continue
                  const match = (am.toolCalls as any[]).find(tc => String(tc?.id || '') === idStr)
                  if (match) {
                    const rawName = match?.function?.name as string | undefined
                    const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
                    if (fnName && (fnName.includes('open-agent') || fnName.includes('open agent') || fnName.includes('edit-agent') || fnName.includes('edit agent'))) {
                      isAgentRelatedTool = true
                    }
                    break
                  }
                }
              } catch {}
            }
            if (!isAgentRelatedTool) continue
            const content = typeof msg.content === 'string' ? String(msg.content).trim() : ''
            if (content) {
              try {
                const parsed = JSON.parse(content) as any
                // Robust slug extraction across shapes
                const candidates: Array<string | undefined> = [
                  typeof parsed?.slug === 'string' ? parsed.slug : undefined,
                  typeof parsed?.data?.slug === 'string' ? parsed.data.slug : undefined,
                  typeof parsed?.body?.slug === 'string' ? parsed.body.slug : undefined,
                  typeof parsed?.body?.data?.slug === 'string' ? parsed.body.data.slug : undefined,
                  typeof parsed?.body?.data?.agent?.slug === 'string' ? parsed.body.data.agent.slug : undefined,
                  typeof parsed?.agent?.slug === 'string' ? parsed.agent.slug : undefined,
                ]
                const foundSlug = candidates.find(s => typeof s === 'string' && s.trim()) as string | undefined
                if (foundSlug && foundSlug.trim()) createdSlugsRef.current.add(foundSlug.trim())
                // Also capture name hint if available
                const nameCandidates: Array<string | undefined> = [
                  typeof parsed?.name === 'string' ? parsed.name : undefined,
                  typeof parsed?.data?.name === 'string' ? parsed.data.name : undefined,
                  typeof parsed?.body?.data?.name === 'string' ? parsed.body.data.name : undefined,
                  typeof parsed?.body?.data?.agent?.name === 'string' ? parsed.body.data.agent.name : undefined,
                  typeof parsed?.agent?.name === 'string' ? parsed.agent.name : undefined,
                ]
                const foundName = nameCandidates.find(n => typeof n === 'string' && n.trim()) as string | undefined
                if (!foundSlug && foundName) createdNamesRef.current.add(foundName)
              } catch {}
            }
          }
        }
      } catch {}

      const slugs = Array.from(createdSlugsRef.current)
      const namesHints = Array.from(createdNamesRef.current)
      if (slugs.length > 0 || namesHints.length > 0) {
        setCreatedSlugs(slugs)
        // Resolve from provided agents cache if available (by slug only)
        if (agents && Array.isArray(agents)) {
          const resolved: any[] = []
          const slugsSet = new Set(slugs)
          for (const a of agents) {
            const aSlug = (a as any)?.slug
            if (aSlug && slugsSet.has(aSlug)) {
              resolved.push(a)
            }
          }
          setCreatedAgents(resolved)
          const namesFromResolved = resolved.map(a => (a as any)?.name).filter(Boolean) as string[]
          // Merge any name hints captured during streaming
          const mergedNames = Array.from(new Set<string>([...namesFromResolved, ...namesHints].filter(Boolean)))
          setCreatedNames(mergedNames)
        } else {
          setCreatedAgents([])
          // If we don't have agents cache, still surface names from hints
          setCreatedNames(namesHints)
        }
        // Persist payload to survive route replaces (e.g., /agent/new -> /agent/{slug})
        try {
          persistModalPayload({ slugs, names: Array.isArray(namesHints) && namesHints.length > 0 ? namesHints : createdNamesRef.current ? Array.from(createdNamesRef.current) : [] })
        } catch {}
        setIsOpen(true)
        createdSlugsRef.current.clear()
        createdNamesRef.current.clear()
        agentCreationCallIdsRef.current.clear()
        agentRelatedCallIdsRef.current.clear()
      }
    }
    prevStreamingRef.current = Boolean(isStreaming)
  }, [isStreaming, liveMessages.length, agents])

  // Cross-mount recovery: if we mount after turn completion (isStreaming=false) and have a recent persisted payload, open modal
  useEffect(() => {
    try {
      if (isStreaming) return
      if (!isOpen) {
        const persisted = consumePersistedPayloadIfAny()
        if (persisted && (persisted.slugs.length > 0 || persisted.names.length > 0)) {
          setCreatedSlugs(persisted.slugs)
          setCreatedNames(persisted.names)
          setIsOpen(true)
        }
      }
    } catch {}
  }, [isStreaming, isOpen, consumePersistedPayloadIfAny])

  // When backing agents list updates after refetch, recompute createdAgents while modal is open (match by slug)
  useEffect(() => {
    if (!isOpen || !Array.isArray(agents)) return
    // Resolve by slug first, and by name as a fallback
    const resolvedNext: any[] = []
    const slugsSet = new Set(createdSlugs)
    for (const a of agents) {
      const aSlug = (a as any)?.slug
      if (aSlug && slugsSet.has(aSlug)) {
        resolvedNext.push(a)
      }
    }

    // Update createdAgents only if it has actually changed (by slug or id)
    setCreatedAgents(prev => {
      const prevKeys = new Set(prev.map(x => String((x as any)?.slug || (x as any)?.id || '')))
      const nextKeys = new Set(resolvedNext.map(x => String((x as any)?.slug || (x as any)?.id || '')))
      if (prevKeys.size === nextKeys.size) {
        let same = true
        for (const k of prevKeys)
          if (!nextKeys.has(k)) {
            same = false
            break
          }
        if (same) return prev
      }
      return resolvedNext
    })

    // Merge names but avoid setting state if unchanged
    const namesFromResolved = resolvedNext.map(a => (a as any)?.name).filter(Boolean)
    setCreatedNames(prev => {
      const mergedSet = new Set<string>(prev || [])
      for (const n of namesFromResolved) mergedSet.add(String(n))
      const merged = Array.from(mergedSet)
      if ((prev || []).length === merged.length) return prev as string[]
      return merged
    })
  }, [agents, isOpen, createdSlugs, createdNames])

  // While modal open, hydrate missing agents by slug via TanStack Query
  useEffect(() => {
    if (!isOpen || createdSlugs.length === 0) return
    const haveSlugs = new Set<string>((createdAgents || []).map(a => String((a as any)?.slug || ''))) as Set<string>
    const toFetch = createdSlugs.filter(s => s && !haveSlugs.has(s))
    if (toFetch.length === 0) return
    ;(async () => {
      const fetched: any[] = []
      for (const slug of toFetch) {
        try {
          const agent = await queryClient.fetchQuery({
            queryKey: AGENT_QUERY_KEYS.bySlugOrId(slug),
            queryFn: () => fetchAgentBySlugOrId(slug),
            staleTime: 30 * 1000,
          })
          if (agent) fetched.push(agent)
        } catch {}
      }
      if (fetched.length > 0) {
        setCreatedAgents(prev => {
          const bySlug = new Map<string, any>(prev.map(a => [String((a as any)?.slug || ''), a]))
          for (const a of fetched) bySlug.set(String((a as any)?.slug || ''), a)
          return Array.from(bySlug.values())
        })
        setCreatedNames(prev => {
          const names = new Set<string>(prev)
          for (const a of fetched) {
            const n = String((a as any)?.name || '')
            if (n) names.add(n)
          }
          const next = Array.from(names)
          if ((prev || []).length === next.length) return prev as string[]
          return next
        })
      }
    })()
  }, [isOpen, createdSlugs, createdAgents, queryClient])

  const findAgentSlugByName = useCallback(
    (name: string | undefined): string | undefined => {
      if (!name || !agents) return undefined
      const n = String(name).toLowerCase()
      const match = agents.find(a => String(a?.name || '').toLowerCase() === n)
      return match?.slug
    },
    [agents]
  )

  // Navigate to conversations with the agent preselected via query param
  const navigateToConversationWithAgent = useCallback(
    (name: string | undefined) => {
      try {
        if (!starshipSlug) return
        const slug = name ? findAgentSlugByName(name) : undefined
        const q = slug ? `?agent=${encodeURIComponent(slug)}` : ''
        router.push(`/ship/${starshipSlug}/conversations${q}`)
      } catch {}
    },
    [router, starshipSlug, findAgentSlugByName]
  )

  const chatWithAgent = useCallback(
    (name: string) => {
      navigateToConversationWithAgent(name)
      setIsOpen(false)
    },
    [navigateToConversationWithAgent]
  )

  const askDaedalusCreateTools = useCallback(
    (agentName: string) => {
      try {
        setIsOpen(false)
        const list = Array.isArray(agents) ? agents : []
        const daedalus =
          list.find(a => String(a?.name || '').toLowerCase() === 'daedalus') ||
          list.find(a =>
            String(a?.slug || '')
              .toLowerCase()
              .startsWith('daedalus')
          ) ||
          list.find(a =>
            String(a?.name || '')
              .toLowerCase()
              .includes('daedalus')
          ) ||
          null
        if (daedalus && setLeadingMentionAgent) {
          const afterText = typeof agentName === 'string' && agentName.trim().length > 0 ? `create a tool for ${agentName.trim()}` : 'create a tool'
          try {
            console.debug('[AgentCreatedModal] askDaedalusCreateTools → setting mention', {
              agent: { id: (daedalus as any)?.id, name: (daedalus as any)?.name, slug: (daedalus as any)?.slug },
              afterText,
            })
          } catch {}
          setLeadingMentionAgent(daedalus as any, afterText)
        }
        if (focusInput) {
          setTimeout(() => {
            try {
              focusInput()
            } catch {}
          }, 50)
        }
      } catch {}
    },
    [agents, setLeadingMentionAgent, focusInput]
  )

  return {
    isOpen,
    createdNames,
    createdAgents,
    setIsOpen,
    chatWithAgent,
    askDaedalusCreateTools,
  }
}
