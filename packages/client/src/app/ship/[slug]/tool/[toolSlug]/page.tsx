'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ToolBuilderView, ToolBuilderViewRef } from '@/components/tools/ToolBuilder'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { toolAPI } from '@/lib/api'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useConversationStreamed } from '@/hooks/useConversations'

export default function ToolBuilderPage(): React.JSX.Element | null {
  const { slug, toolSlug } = useParams<{ slug: string; toolSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, true)
  const toolBuilderRef = useRef<ToolBuilderViewRef>(null)
  const conversationId = useMemo(() => searchParams.get('conversationId') || null, [searchParams])
  const { data: agents = [] } = useStarshipAgents(starship?.id || '', !!starship?.id)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const selectedAgent = useMemo(() => {
    if (convAgents && convAgents.length > 0) return convAgents[0]
    return agents[0] || null
  }, [convAgents, agents])

  // Keep conversation streaming active and capture live messages/UI actions
  const { messages: liveMessages = [], lastUIAction, isResponding } = useConversationStreamed(conversationId, starship?.id || '')

  // Control the expandable overlay: expand only while streaming; user can toggle
  const [isOverlayExpanded, setIsOverlayExpanded] = useState<boolean>(false)
  useEffect(() => {
    setIsOverlayExpanded(!!isResponding)
  }, [isResponding])

  // Track applied tool calls to avoid duplicate writes
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())

  // Stream tool arguments into builder as they arrive
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !toolBuilderRef.current) return

    // Eligible tool slugs that should drive the Tool Builder
    const builderToolSlugs = new Set([
      'tool-open',
      'tool-edit',
      'tool-add-blueprint-node',
      'tool-add-blueprint-edge',
      'tool-blueprint-edit-node',
      'tool-blueprint-remove-node',
      'tool-blueprint-edit-edge',
      'tool-blueprint-remove-edge',
    ])

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
      const calls = (msg as any).toolCalls
      if (!Array.isArray(calls)) continue
      for (let ci = 0; ci < calls.length; ci++) {
        const call = calls[ci]
        const name = call?.function?.name as string
        if (!(builderToolSlugs.has(name) || name?.startsWith?.('tool-blueprint-'))) continue
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

      if (toolName === 'tool-open' || toolName === 'tool-edit') {
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
        case 'tool-add-blueprint-node': {
          const node = normalizeJson(args?.node)
          if (!node || typeof node !== 'object') break
          bp.nodes = (bp.nodes || []).filter((n: any) => n?.ref !== node.ref)
          bp.nodes.push(node)
          compose.blueprintChanged = true
          break
        }
        case 'tool-add-blueprint-edge': {
          const edge = normalizeJson(args?.edge)
          if (!edge || typeof edge !== 'object') break
          bp.edges = (bp.edges || []).filter((e: any) => e?.ref !== edge.ref)
          bp.edges.push(edge)
          compose.blueprintChanged = true
          break
        }
        case 'tool-blueprint-edit-node': {
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
        case 'tool-blueprint-edit-edge': {
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
        case 'tool-blueprint-remove-node': {
          const nodeRef = args?.nodeRef
          if (!nodeRef) break
          bp.nodes = (bp.nodes || []).filter((n: any) => n?.ref !== nodeRef)
          bp.edges = (bp.edges || []).filter((e: any) => e?.from !== nodeRef && e?.to !== nodeRef)
          compose.blueprintChanged = true
          break
        }
        case 'tool-blueprint-remove-edge': {
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

        const toolTools = new Set([
          'tool-open',
          'tool-edit',
          'tool-add-blueprint-node',
          'tool-add-blueprint-edge',
          'tool-blueprint-edit-node',
          'tool-blueprint-remove-node',
          'tool-blueprint-edit-edge',
          'tool-blueprint-remove-edge',
        ])

        if (!toolTools.has(funcName)) {
          processedToolResultIdsRef.current.add(id)
          continue
        }

        // Parse arguments to extract slug if present
        let args: any = toolCall?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {
            // ignore
          }
        }
        const slugArg = args?.slug
        if (!slugArg || typeof slugArg !== 'string') {
          processedToolResultIdsRef.current.add(id)
          continue
        }

        // Fetch complete tool data by slug and sync form
        ;(async () => {
          try {
            const tool = await toolAPI.getBySlug(starship.id, slugArg)
            if (tool && toolBuilderRef.current) {
              toolBuilderRef.current.updateField('name', tool.name || '')
              if (tool.description) toolBuilderRef.current.updateField('description', tool.description)
              if (tool.parameters) toolBuilderRef.current.updateField('parameters', JSON.stringify(tool.parameters, null, 2))
              if (tool.blueprint) toolBuilderRef.current.updateField('blueprint', JSON.stringify(tool.blueprint, null, 2))
            }
          } catch {
            // ignore fetch errors
          } finally {
            processedToolResultIdsRef.current.add(id)
          }
        })()
      }
    }
  }, [conversationId, liveMessages, starship?.id])

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
        <div className="absolute left-0 right-0 bottom-0 p-4 z-30 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <ConversationMessageInput
              selectedAgent={selectedAgent}
              starshipId={starship.id}
              conversationId={conversationId}
              isToolFormOpen={true}
              minimal={true}
              showExpandableOverlay={true}
              isOverlayExpanded={isOverlayExpanded}
              onToggleOverlay={() => setIsOverlayExpanded(prev => !prev)}
            >
              <AgentSelector selectedAgent={selectedAgent} onAgentChange={() => {}} starshipId={starship.id} compact={true} />
            </ConversationMessageInput>
          </div>
        </div>
      )}
    </div>
  )
}
