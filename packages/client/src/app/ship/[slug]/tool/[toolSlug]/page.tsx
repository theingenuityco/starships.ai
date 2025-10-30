'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ToolBuilderView, ToolBuilderViewRef } from '@/components/tools/ToolBuilder'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { toolAPI } from '@/lib/api'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import type { ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useConversationStreamed } from '@/hooks/useConversations'
import { ConversationStreamProvider } from '@/hooks/ConversationStreamContext'
import type { LlmToolCall } from '@starships/autopilot'

export default function ToolBuilderPage(): React.JSX.Element | null {
  const { slug, toolSlug } = useParams<{ slug: string; toolSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, true)
  const toolBuilderRef = useRef<ToolBuilderViewRef>(null)
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const routeUpdatedRef = useRef<boolean>(false)
  const conversationId = useMemo(() => searchParams.get('conversationId') || null, [searchParams])
  const { data: agents = [] } = useStarshipAgents(starship?.id || '', !!starship?.id)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const selectedAgent = useMemo(() => {
    if (convAgents && convAgents.length > 0) return convAgents[0]
    return agents[0] || null
  }, [convAgents, agents])

  // Keep conversation streaming active and capture live messages/UI actions
  const { messages: liveMessages = [], lastUIAction, isResponding } = useConversationStreamed(conversationId, starship?.id || '', { enabled: true })

  // Control the expandable overlay: user-driven; semi-expanded shows automatically while streaming
  const [isOverlayExpanded, setIsOverlayExpanded] = useState<boolean>(false)

  // Track applied tool calls to avoid duplicate writes
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())

  // Track initial message count to only process NEW messages (prevents infinite loop on remount)
  const initialMessageCountRef = useRef<number | null>(null)

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

  // After tool execution completes, fetch and sync tool data once
  const processedToolResultIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !starship?.id || !toolBuilderRef.current) return

    // Check last few messages for tool results
    const recentMessages = liveMessages.slice(-10)

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

        // Attempt to extract slug from tool call arguments
        let args: any = toolCall?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {
            // ignore
          }
        }
        let slugArg: string | undefined = typeof args?.slug === 'string' ? args.slug : undefined

        // Fallback: extract slug from tool result HTTP response shape: body.data.slug
        if (!slugArg) {
          const content = typeof msg.content === 'string' ? String(msg.content).trim() : ''
          if (content) {
            try {
              const parsed = JSON.parse(content) as Record<string, unknown>
              const body = parsed.body as Record<string, unknown> | undefined
              const data = body && typeof body === 'object' ? (body.data as Record<string, unknown> | undefined) : undefined
              const slugVal = data && typeof data.slug === 'string' ? (data.slug as string) : undefined
              slugArg = slugVal
            } catch {}
          }
        }

        if (!slugArg || typeof slugArg !== 'string') {
          processedToolResultIdsRef.current.add(id)
          continue
        }

        // Fetch complete tool data by slug and sync form
        ;(async () => {
          try {
            const tool = await toolAPI.getBySlug(starship.id, slugArg as string)
            if (tool && toolBuilderRef.current) {
              toolBuilderRef.current.updateField('name', tool.name || '')
              if (tool.description) toolBuilderRef.current.updateField('description', tool.description)
              if (tool.parameters) toolBuilderRef.current.updateField('parameters', JSON.stringify(tool.parameters, null, 2))
              if (tool.blueprint) toolBuilderRef.current.updateField('blueprint', JSON.stringify(tool.blueprint, null, 2))
            }
            // If we are currently at /tool/new, replace URL with real slug
            if (!routeUpdatedRef.current && toolSlug === 'new' && typeof slugArg === 'string' && slugArg) {
              const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
              router.replace(`/ship/${slug}/tool/${encodeURIComponent(slugArg)}${q}`)
              routeUpdatedRef.current = true
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

  // Navigate to agent page when agent-related tool calls are detected
  useEffect(() => {
    if (!conversationId || !liveMessages.length) return

    // On first render, record initial message count and don't process
    if (initialMessageCountRef.current === null) {
      initialMessageCountRef.current = liveMessages.length
      return
    }

    // Only process if new messages have arrived
    if (liveMessages.length <= initialMessageCountRef.current) {
      return
    }

    const agentToolSlugFragments = ['open-agent', 'edit-agent', 'assign-agent-tool', 'unassign-agent-tool']

    // Process only NEW messages (those after initial count)
    const newMessages = liveMessages.slice(initialMessageCountRef.current)

    for (const msg of newMessages as any[]) {
      if (msg.role !== 'assistant') continue
      const toolCalls = msg.toolCalls
      if (!Array.isArray(toolCalls)) continue

      for (const call of toolCalls) {
        const funcName = call?.function?.name as string
        const funcNameLc = typeof funcName === 'string' ? funcName.toLowerCase() : ''
        if (!agentToolSlugFragments.some(s => funcNameLc.includes(s))) continue

        // Parse arguments to extract agent slug
        let args: any = call?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {
            // ignore parse errors
          }
        }

        const agentSlug = args?.slug || args?.agentSlug || 'new'

        // Don't navigate if we're somehow trying to navigate to ourselves
        if (agentSlug === toolSlug) {
          continue
        }

        const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
        const targetUrl = `/ship/${slug}/agent/${encodeURIComponent(agentSlug)}${q}`

        router.push(targetUrl)
        return
      }
    }
  }, [conversationId, liveMessages, slug, router, toolSlug])

  // Prefill when editing an existing tool
  useEffect(() => {
    const doPrefill = async () => {
      const starshipId = starship?.id
      if (!starshipId) return
      if (!toolSlug || toolSlug === 'new') return
      try {
        const tool = await toolAPI.getBySlug(starshipId, toolSlug)
        if (tool && toolBuilderRef.current) {
          toolBuilderRef.current.updateField('name', tool.name || '')
          if (tool.description) toolBuilderRef.current.updateField('description', tool.description)
          if (tool.parameters) toolBuilderRef.current.updateField('parameters', JSON.stringify(tool.parameters, null, 2))
          if (tool.blueprint) toolBuilderRef.current.updateField('blueprint', JSON.stringify(tool.blueprint, null, 2))
        }
      } catch {
        // If fetch fails, keep an empty/new form
      }
    }
    doPrefill()
  }, [starship?.id, toolSlug])

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
      <ToolBuilderView ref={toolBuilderRef} starshipId={starship.id} onCancel={handleCancel} />
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
