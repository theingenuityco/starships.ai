'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ToolBuilderView, ToolBuilderViewRef } from '@/components/tools/ToolBuilder'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useQueryClient } from '@tanstack/react-query'
import { fetchStarshipTool, TOOL_QUERY_KEYS, useStarshipTool } from '@/hooks/useTools'
import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse, ToolModel } from '@starships/protocol'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import type { ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useConversationStreamed } from '@/hooks/useConversations'
import { ConversationStreamProvider } from '@/hooks/ConversationStreamContext'
import type { LlmToolCall } from '@starships/autopilot'
import { useDeferredAgentCreationModal } from '@/hooks/useDeferredAgentCreationModal'
import { AgentCreatedModal } from '@/components/agents/AgentCreatedModal'
import { useDeferredToolCreationModal } from '@/hooks/useDeferredToolCreationModal'
import { ToolCreatedModal } from '@/components/tools/ToolCreatedModal'

export default function ToolBuilderPage(): React.JSX.Element | null {
  const { slug, toolSlug } = useParams<{ slug: string; toolSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, true)
  const toolBuilderRef = useRef<ToolBuilderViewRef>(null)
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const routeUpdatedRef = useRef<boolean>(false)
  const queryClient = useQueryClient()
  const creationFlowActiveRef = useRef<boolean>(false)
  // Baseline index for processing tool result messages for the current streaming turn
  const toolResultTurnStartIdxRef = useRef<number | null>(null)
  const setCreationFlowFlag = (on: boolean) => {
    try {
      if (!conversationId) return
      const key = `toolCreationFlow:${conversationId}`
      if (typeof window === 'undefined' || !window.sessionStorage) return
      if (on) window.sessionStorage.setItem(key, JSON.stringify({ ts: Date.now() }))
      else window.sessionStorage.removeItem(key)
    } catch {}
  }
  const conversationId = useMemo(() => searchParams.get('conversationId') || null, [searchParams])
  const { data: agents = [] } = useStarshipAgents(starship?.id || '', !!starship?.id)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const selectedAgent = useMemo(() => {
    if (convAgents && convAgents.length > 0) return convAgents[0]
    return agents[0] || null
  }, [convAgents, agents])

  // Keep conversation streaming active and capture live messages/UI actions
  const { messages: liveMessages = [], lastUIAction, isResponding } = useConversationStreamed(conversationId, starship?.id || '', { enabled: true })
  const deferredAgentCreate = useDeferredAgentCreationModal({
    liveMessages,
    isStreaming: isResponding,
    starshipSlug: String(slug),
    conversationId,
    agents,
    setLeadingMentionAgent: (agent: any, afterText?: string) => {
      try {
        messageInputRef.current?.setLeadingMentionAgent?.(agent, afterText)
      } catch {}
    },
    focusInput: () => {
      try {
        messageInputRef.current?.focusInput?.()
      } catch {}
    },
  })
  const deferredToolCreate = useDeferredToolCreationModal({
    liveMessages,
    isStreaming: isResponding,
    starshipSlug: String(slug),
    conversationId,
    starshipId: starship?.id || null,
    agents,
    setLeadingMentionAgent: (agent: any, afterText?: string) => {
      try {
        messageInputRef.current?.setLeadingMentionAgent?.(agent, afterText)
      } catch {}
    },
    focusInput: () => {
      try {
        messageInputRef.current?.focusInput?.()
      } catch {}
    },
  })

  // Control the expandable overlay: user-driven; semi-expanded shows automatically while streaming
  const [isOverlayExpanded, setIsOverlayExpanded] = useState<boolean>(false)

  // Track applied tool calls to avoid duplicate writes
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())

  // Track initial message count to only process NEW messages (prevents infinite loop on remount)
  const initialMessageCountRef = useRef<number | null>(null)
  // Track baseline for tool-to-tool navigation to avoid duplicate pushes
  const toolNavInitialCountRef = useRef<number | null>(null)

  // Autofocus the conversation input when the page loads (and conversation is present)
  useEffect(() => {
    if (!conversationId) return
    const t = setTimeout(() => {
      try {
        messageInputRef.current?.focusInput?.()
      } catch {}
    }, 150)
    return () => clearTimeout(t)
  }, [conversationId])

  // If we are on /tool/new while streaming, ensure creation flow is active immediately
  useEffect(() => {
    try {
      if (toolSlug === 'new' && isResponding) {
        creationFlowActiveRef.current = true
        setCreationFlowFlag(true)
      }
    } catch {}
  }, [toolSlug, isResponding, conversationId])

  // Reset one-shot route replacement flag at start of streaming turn
  const prevRespondingRef = useRef<boolean>(false)
  useEffect(() => {
    const was = prevRespondingRef.current
    if (!was && isResponding) {
      routeUpdatedRef.current = false
      toolResultTurnStartIdxRef.current = liveMessages.length
    }
    prevRespondingRef.current = Boolean(isResponding)
  }, [isResponding])

  // Stream tool arguments into builder as they arrive
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !toolBuilderRef.current) return

    // Eligible tool slug fragments that should drive the Tool Builder
    const builderToolSlugFragments = [
      'open-tool',
      'edit-tool',
      'add-tool-blueprint-node',
      'add-tool-blueprint-edge',
      'edit-tool-blueprint-node',
      'remove-tool-blueprint-node',
      'edit-tool-blueprint-edge',
      'remove-tool-blueprint-edge',
    ]

    const form = toolBuilderRef.current.getFormData?.()
    if (!form) return

    // Initialize blueprint from form
    let bp: any
    try {
      bp = JSON.parse(form.blueprint || '{}')
    } catch {
      bp = {}
    }
    if (!Array.isArray(bp.nodes)) bp.nodes = []
    if (!Array.isArray(bp.edges)) bp.edges = []

    // Helper to parse JSON-like values
    const normalizeJson = (v: any) => {
      if (typeof v === 'string') {
        try {
          return JSON.parse(v)
        } catch {
          return v
        }
      }
      return v
    }

    // Collect only new toolCalls across all assistant messages in chronological order
    const newCalls: { name: string; args: any }[] = []
    for (let mi = 0; mi < liveMessages.length; mi++) {
      const msg = liveMessages[mi] as any
      if (msg.role !== 'assistant') continue
      const calls = (msg as any).toolCalls as LlmToolCall[] | undefined
      if (!Array.isArray(calls)) continue
      for (let ci = 0; ci < calls.length; ci++) {
        const call = calls[ci]
        const name = call?.function?.name as string
        const nameLc = typeof name === 'string' ? name.toLowerCase() : ''
        if (!(builderToolSlugFragments.some(s => nameLc.includes(s)) || nameLc.includes('tool-blueprint-'))) continue
        let raw = call?.function?.arguments
        const key = `${name}|${typeof raw === 'string' ? raw : JSON.stringify(raw || null)}`
        if (appliedToolCallKeysRef.current.has(key)) continue
        // parse args after key computation to keep key stable on parse errors
        let parsed = raw
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed)
          } catch {
            // keep as-is (may still be partial)
          }
        }
        // skip clearly empty args to avoid wiping state
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0) {
          continue
        }
        newCalls.push({ name, args: parsed })
        appliedToolCallKeysRef.current.add(key)
      }
    }

    if (newCalls.length === 0) return

    // Compose pending scalar field updates
    const compose = {
      name: undefined as undefined | string,
      description: undefined as undefined | string,
      category: undefined as undefined | string,
      exampleUsage: undefined as undefined | string,
      requiresApiKey: undefined as undefined | boolean,
      parameters: undefined as undefined | string,
      blueprintChanged: false,
    }

    const hasContent = (b: any) => (Array.isArray(b?.nodes) && b.nodes.length > 0) || (Array.isArray(b?.edges) && b.edges.length > 0)

    // Apply each new call in order
    for (const call of newCalls) {
      const toolName = call.name
      const args = call.args

      if (toolName === 'open-tool' || toolName === 'edit-tool') {
        if (args?.name !== undefined) compose.name = args.name
        if (args?.description !== undefined) compose.description = args.description
        if (args?.category !== undefined) compose.category = args.category
        if (args?.exampleUsage !== undefined) compose.exampleUsage = args.exampleUsage
        if (args?.requiresApiKey !== undefined) compose.requiresApiKey = args.requiresApiKey
        if (args?.parameters !== undefined) {
          compose.parameters = typeof args.parameters === 'string' ? args.parameters : JSON.stringify(args.parameters, null, 2)
        }
        if (args?.blueprint !== undefined) {
          const incoming = normalizeJson(args.blueprint) || {}
          if (!Array.isArray(incoming.nodes)) incoming.nodes = []
          if (!Array.isArray(incoming.edges)) incoming.edges = []
          // Only replace blueprint if incoming has content OR current bp is empty
          if (hasContent(incoming) || !hasContent(bp)) {
            bp = incoming
            compose.blueprintChanged = true
          }
        }
        continue
      }

      switch (toolName) {
        case 'add-tool-blueprint-node': {
          const node = normalizeJson(args?.node)
          if (!node || typeof node !== 'object') break
          bp.nodes = (bp.nodes || []).filter((n: any) => n?.ref !== node.ref)
          bp.nodes.push(node)
          compose.blueprintChanged = true
          break
        }
        case 'add-tool-blueprint-edge': {
          const edge = normalizeJson(args?.edge)
          if (!edge || typeof edge !== 'object') break
          bp.edges = (bp.edges || []).filter((e: any) => e?.ref !== edge.ref)
          bp.edges.push(edge)
          compose.blueprintChanged = true
          break
        }
        case 'edit-tool-blueprint-node': {
          const nodeRef = args?.nodeRef
          const updates = normalizeJson(args?.updates) || {}
          if (!nodeRef) break
          const idx = (bp.nodes || []).findIndex((n: any) => n?.ref === nodeRef)
          if (idx >= 0) {
            const cur = { ...(bp.nodes[idx] || {}) }
            if ('name' in updates) cur.name = updates.name
            if ('description' in updates) cur.description = updates.description
            if ('type' in updates) cur.type = updates.type
            if ('parameters' in updates) cur.parameters = updates.parameters
            bp.nodes[idx] = cur
            compose.blueprintChanged = true
          }
          break
        }
        case 'edit-tool-blueprint-edge': {
          const edgeRef = args?.edgeRef
          const updates = normalizeJson(args?.updates) || {}
          if (!edgeRef) break
          const idx = (bp.edges || []).findIndex((e: any) => e?.ref === edgeRef)
          if (idx >= 0) {
            const cur = { ...(bp.edges[idx] || {}) }
            if ('from' in updates) cur.from = updates.from
            if ('to' in updates) cur.to = updates.to
            if ('condition' in updates) cur.condition = updates.condition
            bp.edges[idx] = cur
            compose.blueprintChanged = true
          }
          break
        }
        case 'remove-tool-blueprint-node': {
          const nodeRef = args?.nodeRef
          if (!nodeRef) break
          bp.nodes = (bp.nodes || []).filter((n: any) => n?.ref !== nodeRef)
          bp.edges = (bp.edges || []).filter((e: any) => e?.from !== nodeRef && e?.to !== nodeRef)
          compose.blueprintChanged = true
          break
        }
        case 'remove-tool-blueprint-edge': {
          const edgeRef = args?.edgeRef
          if (!edgeRef) break
          bp.edges = (bp.edges || []).filter((e: any) => e?.ref !== edgeRef)
          compose.blueprintChanged = true
          break
        }
      }
    }

    // Write back composed updates once
    if (compose.name !== undefined) toolBuilderRef.current?.updateField('name', compose.name)
    if (compose.description !== undefined) toolBuilderRef.current?.updateField('description', compose.description)
    if (compose.category !== undefined) toolBuilderRef.current?.updateField('category', compose.category as any)
    if (compose.exampleUsage !== undefined) toolBuilderRef.current?.updateField('exampleUsage', compose.exampleUsage)
    if (compose.requiresApiKey !== undefined) toolBuilderRef.current?.updateField('requiresApiKey', compose.requiresApiKey as any)
    if (compose.parameters !== undefined) toolBuilderRef.current?.updateField('parameters', compose.parameters)
    if (compose.blueprintChanged) {
      const bpStr = JSON.stringify(bp, null, 2)
      toolBuilderRef.current?.updateField('blueprint', bpStr)
    }
  }, [conversationId, liveMessages])

  // Manage creation-flow guard across route transitions within the same turn
  useEffect(() => {
    try {
      if (!conversationId) return
      const key = `toolCreationFlow:${conversationId}`
      if (typeof window === 'undefined' || !window.sessionStorage) return
      if (!isResponding) {
        // End of turn: clear persisted flag
        window.sessionStorage.removeItem(key)
        creationFlowActiveRef.current = false
      } else {
        // While streaming: restore flag if set recently (20s)
        const raw = window.sessionStorage.getItem(key)
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { ts?: number }
            if (typeof parsed?.ts === 'number' && Date.now() - parsed.ts < 20000) {
              creationFlowActiveRef.current = true
            }
          } catch {}
        }
      }
    } catch {}
  }, [isResponding, conversationId])

  // While streaming, navigate to a different tool when relevant tool calls target another slug
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !isResponding) return

    // On first render, record baseline and skip processing
    if (toolNavInitialCountRef.current === null) {
      toolNavInitialCountRef.current = liveMessages.length
      return
    }

    // Only process newly arrived messages
    if (liveMessages.length <= (toolNavInitialCountRef.current as number)) return

    const toolBuilderSlugFragments = [
      'open-tool',
      'edit-tool',
      'add-tool-blueprint-node',
      'add-tool-blueprint-edge',
      'edit-tool-blueprint-node',
      'remove-tool-blueprint-node',
      'edit-tool-blueprint-edge',
      'remove-tool-blueprint-edge',
    ]

    const newMessages = (liveMessages as any[]).slice(toolNavInitialCountRef.current as number)

    // Refresh creation flow from session synchronously to avoid race with restore effect
    try {
      if (conversationId && typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(`toolCreationFlow:${conversationId}`)
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { ts?: number }
            if (typeof parsed?.ts === 'number' && Date.now() - parsed.ts < 20000) {
              creationFlowActiveRef.current = true
            }
          } catch {}
        }
      }
    } catch {}

    // PRIORITY PASS: If any EXACT open-tool without slug exists in this turn, immediately route to /tool/new
    if (!creationFlowActiveRef.current) {
      for (const msg of newMessages) {
        if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue
        for (const toolCall of msg.toolCalls as any[]) {
          const funcName = toolCall?.function?.name as string | undefined
          const funcNameLc = typeof funcName === 'string' ? funcName.toLowerCase() : ''
          if (funcNameLc !== 'open-tool') continue
          let args: any = toolCall?.function?.arguments
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args)
            } catch {}
          }
          const src = args && typeof args === 'object' ? (args as any) : undefined
          const nested = src?.tool || src?.data || src?.payload || src
          const nestedSlug = nested && typeof nested.slug === 'string' && nested.slug.trim() ? String(nested.slug) : undefined
          const altToolSlug = typeof src?.toolSlug === 'string' && src.toolSlug.trim() ? String(src.toolSlug) : undefined
          const hasSlug = Boolean(nestedSlug || altToolSlug)
          if (!hasSlug && toolSlug !== 'new') {
            const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
            toolNavInitialCountRef.current = liveMessages.length
            creationFlowActiveRef.current = true
            setCreationFlowFlag(true)
            router.push(`/ship/${slug}/tool/new${q}`)
            return
          }
        }
      }
    }

    // If we are already on /tool/new, do not process any slug-based navigations in this turn
    if (toolSlug === 'new') {
      return
    }
    for (const msg of newMessages) {
      if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue
      for (const toolCall of msg.toolCalls as any[]) {
        const funcName = toolCall?.function?.name as string | undefined
        const funcNameLc = typeof funcName === 'string' ? funcName.toLowerCase() : ''
        if (!funcNameLc) continue
        if (!(toolBuilderSlugFragments.some(s => funcNameLc.includes(s)) || funcNameLc.includes('tool-blueprint-'))) continue

        // Parse arguments to extract next tool slug
        let args: any = toolCall?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {}
        }
        const src = args && typeof args === 'object' ? (args as any) : undefined
        const nested = src?.tool || src?.data || src?.payload || src
        const nestedSlug = nested && typeof nested.slug === 'string' && nested.slug.trim() ? String(nested.slug) : undefined
        const altToolSlug = typeof src?.toolSlug === 'string' && src.toolSlug.trim() ? String(src.toolSlug) : undefined
        const maybeName = nested && typeof nested.name === 'string' && nested.name.trim() ? String(nested.name) : undefined
        const nextToolSlug: string | undefined = nestedSlug || altToolSlug

        // If we have a slug target and it's different, navigate to it (unless creation flow is active this turn)
        if (nextToolSlug && nextToolSlug !== toolSlug && !creationFlowActiveRef.current) {
          const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
          toolNavInitialCountRef.current = liveMessages.length
          router.push(`/ship/${slug}/tool/${encodeURIComponent(nextToolSlug)}${q}`)
          return
        }

        // If this is an open-tool call with no slug, navigate to /new (creation flow)
        if (!nextToolSlug && funcNameLc.includes('open-tool') && toolSlug !== 'new') {
          const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
          toolNavInitialCountRef.current = liveMessages.length
          creationFlowActiveRef.current = true
          setCreationFlowFlag(true)
          router.push(`/ship/${slug}/tool/new${q}`)
          return
        }

        // If this is an edit-tool call with a name but no slug, try to resolve by name using TanStack Query list
        if (!nextToolSlug && funcNameLc.includes('edit-tool') && maybeName && starship?.id) {
          ;(async () => {
            try {
              const list = await queryClient.fetchQuery({
                queryKey: ['starship-tools', starship.id] as const,
                queryFn: async (): Promise<ToolModel[]> => {
                  const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starship.id}/tools`)
                  return response.data.data || []
                },
                staleTime: 30 * 1000,
              })
              const match = (list || []).find(t => String(t?.name || '').toLowerCase() === maybeName.toLowerCase())
              const slugFound = match && typeof match.slug === 'string' ? String(match.slug) : undefined
              if (slugFound && slugFound !== toolSlug) {
                const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
                toolNavInitialCountRef.current = liveMessages.length
                router.push(`/ship/${slug}/tool/${encodeURIComponent(slugFound)}${q}`)
              }
            } catch {}
          })()
          return
        }
      }
    }
  }, [conversationId, isResponding, liveMessages, router, slug, toolSlug])

  // Removed UI-action based navigation to avoid conflicts; rely on streaming toolCalls and tool result handling

  // After tool execution completes (this turn only), fetch and sync tool data (via TanStack Query)
  const processedToolResultIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !starship?.id || !toolBuilderRef.current) return

    // Only process tool results that arrived after the start of this streaming turn
    if (toolResultTurnStartIdxRef.current === null) return

    const recentMessages = liveMessages.slice(toolResultTurnStartIdxRef.current as number)

    for (const msg of recentMessages as any[]) {
      if (msg.role === 'tool' && msg.toolCallId) {
        const id = msg.toolCallId as string
        if (processedToolResultIdsRef.current.has(id)) continue

        // Find the assistant tool call corresponding to this tool result
        const assistantMsg = liveMessages.find((m: any) => m.role === 'assistant' && m.toolCalls?.some((tc: any) => tc.id === id)) as any
        if (!assistantMsg) continue
        const toolCall = assistantMsg.toolCalls?.find((tc: any) => tc.id === id)
        const funcName = toolCall?.function?.name as string
        const funcNameLc = typeof funcName === 'string' ? funcName.toLowerCase() : ''

        const toolToolSlugFragments = [
          'open-tool',
          'edit-tool',
          'add-tool-blueprint-node',
          'add-tool-blueprint-edge',
          'edit-tool-blueprint-node',
          'remove-tool-blueprint-node',
          'edit-tool-blueprint-edge',
          'remove-tool-blueprint-edge',
        ]

        if (!toolToolSlugFragments.some(s => funcNameLc.includes(s))) {
          processedToolResultIdsRef.current.add(id)
          continue
        }

        const isOpenTool = funcNameLc === 'open-tool'
        const isEditTool = funcNameLc === 'edit-tool'

        // Prefer slug from tool result body first (robust extraction across shapes)
        let slugArg: string | undefined
        {
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
                typeof parsed?.body?.data?.tool?.slug === 'string' ? parsed.body.data.tool.slug : undefined,
              ]
              const found = candidates.find(s => typeof s === 'string' && s.trim())
              if (found) slugArg = String(found)
            } catch {}
          }
        }

        // Only if still missing AND this was an edit-tool, fall back to arguments
        if (!slugArg && isEditTool) {
          let args: any = toolCall?.function?.arguments
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args)
            } catch {}
          }
          const argSlug = typeof args?.slug === 'string' ? (args.slug as string) : undefined
          if (argSlug) slugArg = argSlug
        }

        if (!slugArg || typeof slugArg !== 'string') {
          processedToolResultIdsRef.current.add(id)
          continue
        }

        // Fetch complete tool data by slug and sync form using TanStack Query
        ;(async () => {
          try {
            // Force refetch to get freshest server data after edits/creates
            await queryClient.invalidateQueries({ queryKey: TOOL_QUERY_KEYS.detail(starship.id, slugArg as string), exact: true })
            const tool = await queryClient.fetchQuery({
              queryKey: TOOL_QUERY_KEYS.detail(starship.id, slugArg as string),
              queryFn: async (): Promise<ToolModel> => {
                const res: FetchResponse<ApiResponse<ToolModel>> = await api.get(`/api/v1/starships/${starship.id}/tools/${slugArg}`)
                return res.data.data
              },
              staleTime: 30 * 1000,
            })
            if (tool && toolBuilderRef.current) {
              toolBuilderRef.current.updateField('name', tool.name || '')
              if (tool.description) toolBuilderRef.current.updateField('description', tool.description)
              if (tool.parameters) toolBuilderRef.current.updateField('parameters', JSON.stringify(tool.parameters, null, 2))
              if (tool.blueprint) toolBuilderRef.current.updateField('blueprint', JSON.stringify(tool.blueprint, null, 2))
            }
            // If we are currently at /tool/new and creation flow is active, replace URL with the new slug
            if (!routeUpdatedRef.current && toolSlug === 'new' && creationFlowActiveRef.current && typeof slugArg === 'string' && slugArg) {
              const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
              router.replace(`/ship/${slug}/tool/${encodeURIComponent(slugArg)}${q}`)
              routeUpdatedRef.current = true
              creationFlowActiveRef.current = false
              setCreationFlowFlag(false)
            }
          } catch {
            // ignore fetch errors
          } finally {
            processedToolResultIdsRef.current.add(id)
          }
        })()
      }
    }
  }, [conversationId, liveMessages, starship?.id, toolSlug, router, slug])

  // Navigate to Agent Builder for agent-related tool calls (only while streaming, new messages only)
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !isResponding) return

    // On first render, record initial message count and don't process
    if (initialMessageCountRef.current === null) {
      initialMessageCountRef.current = liveMessages.length
      return
    }

    // Only process if new messages have arrived
    if (liveMessages.length <= (initialMessageCountRef.current as number)) {
      return
    }

    const agentToolSlugFragments = ['open-agent', 'edit-agent', 'assign-agent-tool', 'unassign-agent-tool']

    // Process only NEW messages (those after initial count)
    const consideration: any[] = (liveMessages as any[]).slice(initialMessageCountRef.current as number)

    for (const msg of consideration) {
      if (msg.role !== 'assistant') continue
      const toolCalls = msg.toolCalls
      if (!Array.isArray(toolCalls)) continue

      for (const call of toolCalls) {
        const funcName = call?.function?.name as string
        const funcNameLc = typeof funcName === 'string' ? funcName.toLowerCase() : ''
        if (!agentToolSlugFragments.some(s => funcNameLc.includes(s))) continue

        const isOpen = funcNameLc.includes('open-agent')
        const isEdit = funcNameLc.includes('edit-agent')
        const isAssign = funcNameLc.includes('assign-agent-tool')
        const isUnassign = funcNameLc.includes('unassign-agent-tool')

        // Parse arguments
        let args: any = call?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {}
        }

        // Robust nested extraction for agent slug
        const src = args && typeof args === 'object' ? (args as any) : undefined
        const nested = src?.agent || src?.data || src?.payload || src
        const nestedSlug = nested && typeof nested.slug === 'string' && nested.slug.trim() ? String(nested.slug) : undefined
        const altAgentSlug = typeof src?.agentSlug === 'string' && src.agentSlug.trim() ? String(src.agentSlug) : undefined
        let nextAgentSlug: string | undefined = nestedSlug || altAgentSlug
        if (isOpen && !nextAgentSlug) nextAgentSlug = 'new'
        if ((isEdit || isAssign || isUnassign) && !nextAgentSlug) continue
        if (!nextAgentSlug) continue

        const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
        const targetUrl = `/ship/${slug}/agent/${encodeURIComponent(nextAgentSlug)}${q}`

        // Prevent duplicate attempts before unmount by advancing the baseline
        initialMessageCountRef.current = liveMessages.length
        router.push(targetUrl)
        return
      }
    }
  }, [conversationId, liveMessages, slug, router, toolSlug, isResponding])

  // Prefill when editing an existing tool
  const { data: existingTool } = useStarshipTool(starship?.id || '', toolSlug || '', !!starship?.id && !!toolSlug && toolSlug !== 'new')
  useEffect(() => {
    if (!existingTool || !toolBuilderRef.current) return
    toolBuilderRef.current.updateField('name', existingTool.name || '')
    if (existingTool.description) toolBuilderRef.current.updateField('description', existingTool.description)
    if (existingTool.parameters) toolBuilderRef.current.updateField('parameters', JSON.stringify(existingTool.parameters, null, 2))
    if (existingTool.blueprint) toolBuilderRef.current.updateField('blueprint', JSON.stringify(existingTool.blueprint, null, 2))
  }, [existingTool])

  const handleCancel = () => {
    if (conversationId) {
      router.push(`/ship/${slug}/conversations/${conversationId}`)
    } else {
      router.push(`/ship/${slug}/conversations`)
    }
  }

  if (!starship?.id) return null

  return (
    <div className="relative h-screen w-full">
      <AgentCreatedModal
        open={deferredAgentCreate.isOpen}
        names={deferredAgentCreate.createdNames}
        onOpenChange={deferredAgentCreate.setIsOpen}
        onChatWithAgent={deferredAgentCreate.chatWithAgent}
        onAskDaedalusCreateTools={deferredAgentCreate.askDaedalusCreateTools}
        agents={Array.isArray(deferredAgentCreate.createdAgents) ? (deferredAgentCreate.createdAgents as any) : undefined}
      />
      <ToolCreatedModal
        open={deferredToolCreate.isOpen}
        names={deferredToolCreate.createdNames}
        onOpenChange={deferredToolCreate.setIsOpen}
        onOpenTool={deferredToolCreate.openToolInBuilder}
        slugs={deferredToolCreate.createdSlugs}
        tools={Array.isArray(deferredToolCreate.createdTools) ? (deferredToolCreate.createdTools as any) : undefined}
        onAskGaiaAssignTool={deferredToolCreate.askGaiaAssignTool}
      />
      <ToolBuilderView
        ref={toolBuilderRef}
        starshipId={starship.id}
        onCancel={handleCancel}
        toolId={existingTool?.id}
        templateId={existingTool?.templateId}
      />
      {conversationId && (
        <ConversationStreamProvider conversationId={conversationId} starshipId={starship.id}>
          <div className="absolute left-0 right-0 bottom-[22px] px-6 z-30 pointer-events-none">
            <div className="max-w-2xl mx-auto pointer-events-auto">
              <ConversationMessageInput
                ref={messageInputRef}
                selectedAgent={selectedAgent}
                starshipId={starship.id}
                conversationId={conversationId}
                isToolFormOpen={true}
                minimal={true}
                showExpandableOverlay={true}
                isOverlayExpanded={isOverlayExpanded}
                onFocus={() => {
                  if (!isResponding) setIsOverlayExpanded(true)
                }}
                onBlur={() => setIsOverlayExpanded(false)}
                onToggleOverlay={() => setIsOverlayExpanded(prev => !prev)}
                starshipSlug={slug}
              >
                <AgentSelector selectedAgent={selectedAgent} onAgentChange={() => {}} starshipId={starship.id} compact={true} />
              </ConversationMessageInput>
            </div>
          </div>
        </ConversationStreamProvider>
      )}
    </div>
  )
}
