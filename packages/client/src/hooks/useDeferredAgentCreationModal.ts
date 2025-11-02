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

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [createdNames, setCreatedNames] = useState<string[]>([])
  const [createdAgents, setCreatedAgents] = useState<any[]>([])
  const [createdSlugs, setCreatedSlugs] = useState<string[]>([])

  // While streaming, collect created agent slugs from assistant args ONLY (agent-related calls)
  useEffect(() => {
    if (!isStreaming || !liveMessages.length) return

    // Only process messages that arrived during this streaming turn
    // Include the last message that may receive in-place updates (e.g., toolCalls replacement)
    const startIndex = Math.max(0, Math.min(turnStartIndexRef.current, liveMessages.length - 1))
    const recent = liveMessages.slice(startIndex)
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i] as any
      if (!msg) continue
      // Assistant tool call arguments may include slug for open existing
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
          const slug = args && typeof args.slug === 'string' && args.slug.trim().length > 0 ? String(args.slug) : null
          const name = args && typeof args.name === 'string' && args.name.trim().length > 0 ? String(args.name) : null
          if (slug) createdSlugsRef.current.add(slug)
          // New agent creation path typically lacks slug but includes name; capture it
          if (!slug && name) createdNamesRef.current.add(name)
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
      setCreatedSlugs([])
      setCreatedAgents([])
      setCreatedNames([])
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
              const slug = args && typeof args.slug === 'string' && args.slug.trim().length > 0 ? String(args.slug) : null
              const name = args && typeof args.name === 'string' && args.name.trim().length > 0 ? String(args.name) : null
              if (slug) createdSlugsRef.current.add(slug)
              if (!slug && name) createdNamesRef.current.add(name)
            }
          }
        }
      } catch {}

      const slugs = Array.from(createdSlugsRef.current)
      const namesOnly = Array.from(createdNamesRef.current)
      if (slugs.length > 0 || namesOnly.length > 0) {
        setCreatedSlugs(slugs)
        // Resolve from provided agents cache if available
        if (agents && Array.isArray(agents)) {
          const resolved: any[] = []
          const slugsSet = new Set(slugs)
          const namesSet = new Set(namesOnly.map(n => String(n).toLowerCase()))
          for (const a of agents) {
            const aSlug = (a as any)?.slug
            const aName = String((a as any)?.name || '')
            if ((aSlug && slugsSet.has(aSlug)) || (aName && namesSet.has(aName.toLowerCase()))) {
              resolved.push(a)
            }
          }
          setCreatedAgents(resolved)
          const namesFromResolved = resolved.map(a => (a as any)?.name).filter(Boolean)
          const mergedNames = Array.from(new Set([...(namesOnly || []), ...namesFromResolved]))
          setCreatedNames(mergedNames)
        } else {
          setCreatedAgents([])
          setCreatedNames(namesOnly)
        }
        setIsOpen(true)
        createdSlugsRef.current.clear()
        createdNamesRef.current.clear()
      }
    }
    prevStreamingRef.current = Boolean(isStreaming)
  }, [isStreaming, liveMessages.length, agents])

  // When backing agents list updates after refetch, recompute createdAgents while modal is open (match by slug)
  useEffect(() => {
    if (!isOpen || !Array.isArray(agents)) return
    // Resolve by slug first, and by name as a fallback
    const resolvedNext: any[] = []
    const slugsSet = new Set(createdSlugs)
    const namesSet = new Set((createdNames || []).map(n => String(n).toLowerCase()))
    for (const a of agents) {
      const aSlug = (a as any)?.slug
      const aName = String((a as any)?.name || '')
      if ((aSlug && slugsSet.has(aSlug)) || (aName && namesSet.has(aName.toLowerCase()))) {
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
    if (namesFromResolved.length > 0) {
      setCreatedNames(prev => {
        const mergedSet = new Set<string>(prev || [])
        for (const n of namesFromResolved) mergedSet.add(String(n))
        const merged = Array.from(mergedSet)
        if ((prev || []).length === merged.length) return prev as string[]
        return merged
      })
    }
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

  const navigateToAgent = useCallback(
    (name: string | undefined) => {
      try {
        if (!name || !starshipSlug) return
        const slug = findAgentSlugByName(name) || 'new'
        const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
        router.push(`/ship/${starshipSlug}/agent/${encodeURIComponent(slug)}${q}`)
      } catch {}
    },
    [router, starshipSlug, conversationId, findAgentSlugByName]
  )

  const chatWithAgent = useCallback(
    (name: string) => {
      navigateToAgent(name)
      setIsOpen(false)
    },
    [navigateToAgent]
  )

  const askDaedalusCreateTools = useCallback(
    (_: string) => {
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
          try {
            console.debug('[AgentCreatedModal] askDaedalusCreateTools → setting mention', {
              agent: { id: (daedalus as any)?.id, name: (daedalus as any)?.name, slug: (daedalus as any)?.slug },
              afterText: 'create a tool for the agent please',
            })
          } catch {}
          setLeadingMentionAgent(daedalus as any, 'create a tool for the agent please')
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
