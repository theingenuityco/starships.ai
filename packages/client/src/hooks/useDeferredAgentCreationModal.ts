'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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

  const prevStreamingRef = useRef<boolean>(false)
  const createdNamesRef = useRef<Set<string>>(new Set())

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [createdNames, setCreatedNames] = useState<string[]>([])
  const [createdAgents, setCreatedAgents] = useState<any[]>([])

  // While streaming, look for assistant tool calls that represent agent creation
  useEffect(() => {
    if (!isStreaming || !liveMessages.length) return

    const recent = liveMessages.slice(-10)
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i] as any
      if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.toolCalls)) continue
      for (const tc of msg.toolCalls as any[]) {
        const rawName = tc?.function?.name as string | undefined
        const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
        if (!fnName || !fnName.includes('open-agent')) continue

        let args: any = tc?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {}
        }
        const hasName = args && typeof args.name === 'string' && args.name.trim().length > 0
        const hasSlug = args && typeof args.slug === 'string' && args.slug.trim().length > 0
        if (hasName && !hasSlug) {
          createdNamesRef.current.add(String(args.name))
        }
      }
    }
  }, [isStreaming, liveMessages])

  // When streaming ends, open the modal if any creations were detected
  useEffect(() => {
    const was = prevStreamingRef.current
    if (was && !isStreaming) {
      const names = Array.from(createdNamesRef.current)
      if (names.length > 0) {
        setCreatedNames(names)
        // Try resolve to Agent models if provided
        if (agents && Array.isArray(agents)) {
          const resolved: any[] = []
          for (const n of names) {
            const nm = String(n).toLowerCase()
            const m = agents.find(a => String((a as any)?.name || '').toLowerCase() === nm)
            if (m) resolved.push(m)
          }
          setCreatedAgents(resolved)
        } else {
          setCreatedAgents([])
        }
        setIsOpen(true)
        createdNamesRef.current.clear()
      }
    }
    prevStreamingRef.current = Boolean(isStreaming)
  }, [isStreaming])

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


