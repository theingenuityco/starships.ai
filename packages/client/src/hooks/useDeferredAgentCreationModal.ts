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
}) {
  const isStreaming = Boolean(options?.isStreaming)
  const liveMessages = Array.isArray(options?.liveMessages) ? (options!.liveMessages as any[]) : []
  const starshipSlug = typeof options?.starshipSlug === 'string' ? options!.starshipSlug : undefined
  const conversationId = typeof options?.conversationId === 'string' ? options!.conversationId : undefined
  const agents = Array.isArray(options?.agents) ? options!.agents : undefined
  const router = useRouter()
  const queryClient = useQueryClient()

  const prevStreamingRef = useRef<boolean>(false)
  const createdSlugsRef = useRef<Set<string>>(new Set())

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [createdNames, setCreatedNames] = useState<string[]>([])
  const [createdAgents, setCreatedAgents] = useState<any[]>([])
  const [createdSlugs, setCreatedSlugs] = useState<string[]>([])

  // While streaming, collect created agent slugs from tool results and assistant args
  useEffect(() => {
    if (!isStreaming || !liveMessages.length) return

    const recent = liveMessages.slice(-20)
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i] as any
      if (!msg) continue
      // 1) Tool result messages often contain body.data.slug
      if (msg.role === 'tool' && msg.content && typeof msg.content === 'string') {
        try {
          const parsed = JSON.parse(msg.content)
          const body = parsed && typeof parsed === 'object' ? (parsed as any).body : undefined
          const data = body && typeof body === 'object' ? (body as any).data : undefined
          const slug: string | undefined = data && typeof (data as any).slug === 'string' ? (data as any).slug : undefined
          if (slug) createdSlugsRef.current.add(slug)
        } catch {}
      }
      // 2) Assistant tool call arguments may include slug for open existing
      if (msg.role === 'assistant' && Array.isArray((msg as any).toolCalls)) {
        for (const tc of (msg as any).toolCalls as any[]) {
          const rawName = tc?.function?.name as string | undefined
          const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
          if (!fnName || !fnName.includes('open-agent')) continue
          let args: any = tc?.function?.arguments
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args)
            } catch {}
          }
          const slug = args && typeof args.slug === 'string' && args.slug.trim().length > 0 ? String(args.slug) : null
          if (slug) createdSlugsRef.current.add(slug)
        }
      }
    }
  }, [isStreaming, liveMessages])

  // When streaming ends, open the modal if any creations were detected
  useEffect(() => {
    const was = prevStreamingRef.current
    if (was && !isStreaming) {
      const slugs = Array.from(createdSlugsRef.current)
      if (slugs.length > 0) {
        setCreatedSlugs(slugs)
        // Resolve from provided agents cache if available
        if (agents && Array.isArray(agents)) {
          const resolved: any[] = []
          for (const a of agents) {
            const slug = (a as any)?.slug
            if (slug && slugs.includes(slug)) resolved.push(a)
          }
          setCreatedAgents(resolved)
          setCreatedNames(resolved.map(a => (a as any)?.name).filter(Boolean))
        } else {
          setCreatedAgents([])
          setCreatedNames([])
        }
        setIsOpen(true)
        createdSlugsRef.current.clear()
      }
    }
    prevStreamingRef.current = Boolean(isStreaming)
  }, [isStreaming])

  // When backing agents list updates after refetch, recompute createdAgents while modal is open (match by slug)
  useEffect(() => {
    if (!isOpen || !Array.isArray(agents) || createdSlugs.length === 0) return
    const resolved: any[] = []
    const slugs = new Set(createdSlugs)
    for (const a of agents) {
      const slug = (a as any)?.slug
      if (slug && slugs.has(slug)) resolved.push(a)
    }
    setCreatedAgents(resolved)
    setCreatedNames(resolved.map(a => (a as any)?.name).filter(Boolean))
  }, [agents, isOpen, createdSlugs])

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
          return Array.from(names)
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
    (name: string) => {
      navigateToAgent(name)
      setIsOpen(false)
    },
    [navigateToAgent]
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


