'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse, ToolModel } from '@starships/protocol'

/**
 * Detects tool creations during an active streaming turn and exposes a modal state
 * that opens only after the turn completes.
 *
 * Detection heuristic: assistant tool call named like 'open-tool*' with a provided name and no slug,
 * then a tool role message or follow-up args that include the created tool slug.
 */
export function useDeferredToolCreationModal(options: { liveMessages: any[] | undefined; isStreaming: boolean | undefined; starshipSlug?: string | null; conversationId?: string | null; starshipId?: string | null }) {
  const isStreaming = Boolean(options?.isStreaming)
  const liveMessages = Array.isArray(options?.liveMessages) ? (options!.liveMessages as any[]) : []
  const starshipSlug = typeof options?.starshipSlug === 'string' ? options!.starshipSlug : undefined
  const conversationId = typeof options?.conversationId === 'string' ? options!.conversationId : undefined
  const router = useRouter()
  const starshipId = typeof options?.starshipId === 'string' ? options!.starshipId : undefined
  const queryClient = useQueryClient()

  const prevStreamingRef = useRef<boolean>(false)
  const createdSlugsRef = useRef<Set<string>>(new Set())
  const createdNamesRef = useRef<Set<string>>(new Set())
  const turnStartIndexRef = useRef<number>(0)
  const toolCreationCallIdsRef = useRef<Set<string>>(new Set())
  const toolRelatedCallIdsRef = useRef<Set<string>>(new Set())

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [createdNames, setCreatedNames] = useState<string[]>([])
  const [createdSlugs, setCreatedSlugs] = useState<string[]>([])
  const [createdTools, setCreatedTools] = useState<any[]>([])

  const persistModalPayload = useCallback(
    (payload: { slugs: string[]; names: string[] }) => {
      try {
        if (!conversationId) return
        const key = `toolCreatedModal:${conversationId}`
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
      const key = `toolCreatedModal:${conversationId}`
      if (typeof window === 'undefined' || !window.sessionStorage) return null
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { slugs?: string[]; names?: string[]; ts?: number }
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

  // While streaming, track tool-creation candidate call ids (assistant calls without slug)
  useEffect(() => {
    if (!isStreaming || !liveMessages.length) return

    const startIndex = Math.max(0, Math.min(turnStartIndexRef.current, liveMessages.length - 1))
    const recent = liveMessages.slice(startIndex)
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i] as any
      if (!msg) continue
      if (msg.role === 'assistant' && Array.isArray((msg as any).toolCalls)) {
        for (const tc of (msg as any).toolCalls as any[]) {
          const rawName = tc?.function?.name as string | undefined
          const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
          if (!fnName || (!fnName.includes('open-tool') && !fnName.includes('edit-tool') && !fnName.includes('tool-blueprint-'))) continue
          let args: any = tc?.function?.arguments
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args)
            } catch {}
          }
          const src = args && typeof args === 'object' ? (args as any) : undefined
          const nested = src?.tool || src?.data || src?.payload || src
          const nestedSlug = nested && typeof nested.slug === 'string' && nested.slug.trim() ? String(nested.slug) : undefined
          const altToolSlug = typeof src?.toolSlug === 'string' && src.toolSlug.trim() ? String(src.toolSlug) : undefined
          const slug = nestedSlug || altToolSlug || null
          const maybeName = nested && typeof nested.name === 'string' && nested.name.trim() ? String(nested.name) : undefined
          const callId = typeof (tc as any)?.id === 'string' ? String((tc as any).id) : undefined
          if (callId) toolRelatedCallIdsRef.current.add(callId)
          if (!slug && callId) toolCreationCallIdsRef.current.add(callId)
          if (!slug && maybeName) {
            createdNamesRef.current.add(maybeName)
          }
        }
      }
    }
  }, [isStreaming, liveMessages])

  // Manage per-turn state and open the modal on end
  useEffect(() => {
    const was = prevStreamingRef.current
    if (!was && isStreaming) {
      createdSlugsRef.current.clear()
      createdNamesRef.current.clear()
      toolCreationCallIdsRef.current.clear()
      toolRelatedCallIdsRef.current.clear()
      setCreatedSlugs([])
      setCreatedNames([])
      turnStartIndexRef.current = Math.max(0, liveMessages.length - 1)
    }
    if (was && !isStreaming) {
      try {
        const startIndex = Math.max(0, Math.min(turnStartIndexRef.current, liveMessages.length))
        for (let i = startIndex; i < liveMessages.length; i++) {
          const msg: any = liveMessages[i]
          if (!msg) continue
          if (msg.role === 'assistant' && Array.isArray((msg as any).toolCalls)) {
            for (const tc of (msg as any).toolCalls as any[]) {
              const rawName = tc?.function?.name as string | undefined
              const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
              if (!fnName || (!fnName.includes('open-tool') && !fnName.includes('edit-tool') && !fnName.includes('tool-blueprint-'))) continue
              let args: any = tc?.function?.arguments
              if (typeof args === 'string') {
                try {
                  args = JSON.parse(args)
                } catch {}
              }
              const src = args && typeof args === 'object' ? (args as any) : undefined
              const nested = src?.tool || src?.data || src?.payload || src
              const nestedSlug = nested && typeof nested.slug === 'string' && nested.slug.trim() ? String(nested.slug) : undefined
              const altToolSlug = typeof src?.toolSlug === 'string' && src.toolSlug.trim() ? String(src.toolSlug) : undefined
              const slug = nestedSlug || altToolSlug || null
              const maybeName = nested && typeof nested.name === 'string' && nested.name.trim() ? String(nested.name) : undefined
              const callId = typeof (tc as any)?.id === 'string' ? String((tc as any).id) : undefined
              if (!slug && callId) {
                toolCreationCallIdsRef.current.add(callId)
              } else if (slug && callId && (toolCreationCallIdsRef.current.has(callId) || toolRelatedCallIdsRef.current.has(callId))) {
                createdSlugsRef.current.add(slug)
              } else if (!slug && callId && toolCreationCallIdsRef.current.has(callId)) {
                if (fnName.startsWith('open-tool-')) {
                  const suffix = fnName.slice('open-tool-'.length)
                  if (suffix) createdSlugsRef.current.add(suffix)
                } else if (fnName.startsWith('edit-tool-')) {
                  const suffix = fnName.slice('edit-tool-'.length)
                  if (suffix) createdSlugsRef.current.add(suffix)
                }
              }
              if (!slug && maybeName) {
                createdNamesRef.current.add(maybeName)
              }
            }
          }
          if (msg.role === 'tool' && msg.toolCallId) {
            const idStr = String(msg.toolCallId)
            let isToolRelated = toolCreationCallIdsRef.current.has(idStr) || toolRelatedCallIdsRef.current.has(idStr)
            if (!isToolRelated) {
              try {
                for (let j = liveMessages.length - 1; j >= 0; j--) {
                  const am = liveMessages[j] as any
                  if (am?.role !== 'assistant' || !Array.isArray(am?.toolCalls)) continue
                  const match = (am.toolCalls as any[]).find(tc => String(tc?.id || '') === idStr)
                  if (match) {
                    const rawName = match?.function?.name as string | undefined
                    const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
                    if (fnName && (fnName.includes('open-tool') || fnName.includes('edit-tool') || fnName.includes('tool-blueprint-'))) {
                      isToolRelated = true
                    }
                    break
                  }
                }
              } catch {}
            }
            if (!isToolRelated) continue
            const content = typeof msg.content === 'string' ? String(msg.content).trim() : ''
            if (content) {
              try {
                const parsed = JSON.parse(content) as any
                const candidates: Array<string | undefined> = [
                  typeof parsed?.slug === 'string' ? parsed.slug : undefined,
                  typeof parsed?.data?.slug === 'string' ? parsed.data.slug : undefined,
                  typeof parsed?.body?.slug === 'string' ? parsed.body.slug : undefined,
                  typeof parsed?.body?.data?.slug === 'string' ? parsed.body.data.slug : undefined,
                  typeof parsed?.tool?.slug === 'string' ? parsed.tool.slug : undefined,
                ]
                const foundSlug = candidates.find(s => typeof s === 'string' && s.trim()) as string | undefined
                if (foundSlug && foundSlug.trim()) createdSlugsRef.current.add(foundSlug.trim())
                const nameCandidates: Array<string | undefined> = [
                  typeof parsed?.name === 'string' ? parsed.name : undefined,
                  typeof parsed?.data?.name === 'string' ? parsed.data.name : undefined,
                  typeof parsed?.body?.data?.name === 'string' ? parsed.body.data.name : undefined,
                  typeof parsed?.tool?.name === 'string' ? parsed.tool.name : undefined,
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
      if (slugs.length > 0) {
        setCreatedSlugs(slugs)
        setCreatedNames(namesHints)
        try {
          persistModalPayload({ slugs, names: namesHints })
        } catch {}
        setIsOpen(true)
        createdSlugsRef.current.clear()
        createdNamesRef.current.clear()
        toolCreationCallIdsRef.current.clear()
        toolRelatedCallIdsRef.current.clear()
      }
    }
    prevStreamingRef.current = Boolean(isStreaming)
  }, [isStreaming, liveMessages.length])

  // Cross-mount recovery
  useEffect(() => {
    try {
      if (isStreaming) return
      if (!isOpen) {
        const persisted = consumePersistedPayloadIfAny()
        if (persisted && persisted.slugs.length > 0) {
          setCreatedSlugs(persisted.slugs)
          setCreatedNames(persisted.names)
          setIsOpen(true)
        }
      }
    } catch {}
  }, [isStreaming, isOpen, consumePersistedPayloadIfAny])

  // While modal open, hydrate tools by slug
  useEffect(() => {
    if (!isOpen || createdSlugs.length === 0 || !starshipId) return
    let cancelled = false
    ;(async () => {
      const fetched: ToolModel[] = []
      for (const slug of createdSlugs) {
        try {
          const tool = await queryClient.fetchQuery({
            queryKey: ['starship-tool', starshipId, slug] as const,
            queryFn: async (): Promise<ToolModel> => {
              const res: FetchResponse<ApiResponse<ToolModel>> = await api.get(`/api/v1/starships/${starshipId}/tools/${slug}`)
              return res.data.data
            },
            staleTime: 30 * 1000,
          })
          if (tool) fetched.push(tool)
        } catch {}
      }
      if (!cancelled && fetched.length > 0) {
        setCreatedTools(prev => {
          const bySlug = new Map<string, any>(prev.map(t => [String((t as any)?.slug || ''), t]))
          for (const t of fetched) bySlug.set(String((t as any)?.slug || ''), t)
          return Array.from(bySlug.values())
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, createdSlugs, starshipId, queryClient])

  const openToolInBuilder = useCallback(
    (identifier?: string) => {
      try {
        if (!starshipSlug) return
        let toolSlug: string | undefined
        const id = String(identifier || '').trim()
        if (id) toolSlug = id
        if (!toolSlug && Array.isArray(createdSlugs) && createdSlugs.length > 0) toolSlug = createdSlugs[0]
        const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
        router.push(`/ship/${starshipSlug}/tool/${encodeURIComponent(toolSlug || 'new')}${q}`)
        setIsOpen(false)
      } catch {}
    },
    [router, starshipSlug, conversationId, createdSlugs]
  )

  return {
    isOpen,
    createdNames,
    createdSlugs,
    setIsOpen,
    openToolInBuilder,
    createdTools,
  }
}
