'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AgentBuilderView, AgentBuilderViewRef } from '@/components/agents/AgentBuilder'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { agentAPI } from '@/lib/api'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import type { ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useConversationStreamed } from '@/hooks/useConversations'
import { ConversationStreamProvider } from '@/hooks/ConversationStreamContext'

export default function AgentBuilderPage(): React.JSX.Element | null {
  const { slug, agentSlug } = useParams<{ slug: string; agentSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, true)
  const agentBuilderRef = useRef<AgentBuilderViewRef>(null)
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const routeUpdatedRef = useRef<boolean>(false)
  const conversationId = searchParams.get('conversationId') || null
  const { data: agents = [] } = useStarshipAgents(starship?.id || '', !!starship?.id)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const selectedAgent = useMemo(() => {
    if (convAgents && convAgents.length > 0) return convAgents[0]
    return agents[0] || null
  }, [convAgents, agents])

  // Keep conversation streaming active and capture live messages/UI actions
  const { messages: liveMessages = [], isResponding } = useConversationStreamed(conversationId, starship?.id || '')

  // Control the expandable overlay: user-driven; semi-expanded shows automatically while streaming
  const [isOverlayExpanded, setIsOverlayExpanded] = useState<boolean>(false)

  // Track applied tool call keys to avoid duplicate writes
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())

  // After tool execution completes, fetch and sync agent data once
  const processedToolResultIdsRef = useRef<Set<string>>(new Set())

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

  // Ensure slug is present in form ASAP so downstream effects can resolve agentId
  useEffect(() => {
    if (!agentBuilderRef.current) return
    if (agentSlug && agentSlug !== 'new') {
      agentBuilderRef.current.updateField('slug', String(agentSlug))
    }
  }, [agentSlug])

  // Stream agent arguments into builder as they arrive
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !agentBuilderRef.current) return

    // On first render, record initial message count and don't process
    if (initialMessageCountRef.current === null) {
      initialMessageCountRef.current = liveMessages.length
      return
    }

    // Only process if new messages have arrived
    if (liveMessages.length <= initialMessageCountRef.current) {
      return
    }

    // Eligible tool slugs that should drive the Agent Builder
    // Note: We intentionally exclude assignment calls from driving UI state to avoid
    // reflecting changes before the server confirms them.
    const builderToolSlugs = new Set(['agent-open', 'agent-edit'])

    const form = agentBuilderRef.current.getFormData?.()
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

    // Collect only new toolCalls across assistant messages since mount in chronological order
    const considerationMessages = (liveMessages as any[]).slice(initialMessageCountRef.current)
    const newCalls: { name: string; args: any }[] = []
    for (let mi = 0; mi < considerationMessages.length; mi++) {
      const msg = considerationMessages[mi] as any
      if (msg.role !== 'assistant') continue
      const calls = (msg as any).toolCalls
      if (!Array.isArray(calls)) continue
      for (let ci = 0; ci < calls.length; ci++) {
        const call = calls[ci]
        const name = call?.function?.name as string
        if (!builderToolSlugs.has(name)) continue
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
      slug: undefined as undefined | string,
      description: undefined as undefined | string,
      category: undefined as undefined | string,
      model: undefined as undefined | string,
      temperature: undefined as undefined | number,
      maxTokens: undefined as undefined | number,
      systemPrompt: undefined as undefined | string,
      previewPrompts: undefined as undefined | string[],
      assignedToolSlugs: undefined as undefined | string[],
      icon: undefined as undefined | string,
      timeout: undefined as undefined | number,
      blueprintChanged: false,
    }

    const hasContent = (b: any) => (Array.isArray(b?.nodes) && b.nodes.length > 0) || (Array.isArray(b?.edges) && b.edges.length > 0)

    // Apply each new call in order
    for (const call of newCalls) {
      const toolName = call.name
      const args = call.args

      if (toolName === 'agent-open' || toolName === 'agent-edit') {
        if (args?.name !== undefined) compose.name = args.name
        if (args?.slug !== undefined) compose.slug = args.slug
        if (args?.description !== undefined) compose.description = args.description
        if (args?.category !== undefined) compose.category = args.category
        if (args?.model !== undefined) compose.model = args.model
        if (args?.temperature !== undefined) compose.temperature = args.temperature
        if (args?.maxTokens !== undefined) compose.maxTokens = args.maxTokens
        if (args?.systemPrompt !== undefined) compose.systemPrompt = args.systemPrompt
        if (Array.isArray(args?.previewPrompts)) compose.previewPrompts = (args.previewPrompts as any[]).filter(p => typeof p === 'string' && p.trim()).slice(0, 10) as string[]
        if (args?.icon !== undefined) compose.icon = args.icon
        if (args?.timeout !== undefined) compose.timeout = args.timeout
        // Do not apply assignedToolSlugs from streaming arguments. We only
        // reflect tool assignments after confirmed tool completion and a
        // fresh fetch from the server.
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

      // Ignore agent-assign-tool and agent-unassign-tool here. We will sync
      // assignments only after tool completion via server fetch below.
    }

    // Write back composed updates once
    if (compose.name !== undefined) agentBuilderRef.current?.updateField('name', compose.name)
    if (compose.slug !== undefined) agentBuilderRef.current?.updateField('slug', compose.slug)
    if (compose.description !== undefined) agentBuilderRef.current?.updateField('description', compose.description)
    if (compose.category !== undefined) agentBuilderRef.current?.updateField('category', compose.category as any)
    if (compose.model !== undefined) agentBuilderRef.current?.updateField('model', compose.model)
    if (compose.temperature !== undefined) agentBuilderRef.current?.updateField('temperature', compose.temperature as any)
    if (compose.maxTokens !== undefined) agentBuilderRef.current?.updateField('maxTokens', compose.maxTokens as any)
    if (compose.systemPrompt !== undefined) agentBuilderRef.current?.updateField('systemPrompt', compose.systemPrompt)
    if (compose.icon !== undefined) agentBuilderRef.current?.updateField('icon', compose.icon)
    if (compose.timeout !== undefined) agentBuilderRef.current?.updateField('timeout', compose.timeout as any)
    if (compose.assignedToolSlugs !== undefined) agentBuilderRef.current?.updateField('assignedToolSlugs', compose.assignedToolSlugs as any)
    if (compose.previewPrompts !== undefined) agentBuilderRef.current?.updateField('previewPrompts', compose.previewPrompts as any)
    if (compose.blueprintChanged) {
      const bpStr = JSON.stringify(bp, null, 2)
      agentBuilderRef.current?.updateField('blueprint', bpStr)
    }
  }, [conversationId, liveMessages])

  // After agent tool execution completes, fetch and sync agent data once
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !agentBuilderRef.current) return

    // On first render, record initial message count and don't process
    if (initialMessageCountRef.current === null) {
      initialMessageCountRef.current = liveMessages.length
      return
    }

    // Only process if new messages have arrived
    if (liveMessages.length <= initialMessageCountRef.current) {
      return
    }

    // Check only NEW messages for tool results
    const recentMessages = (liveMessages as any[]).slice(initialMessageCountRef.current)

    for (const msg of recentMessages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        const id = msg.toolCallId as string
        if (processedToolResultIdsRef.current.has(id)) continue

        // Find the assistant tool call corresponding to this tool result
        const assistantMsg = (liveMessages as any[]).find(m => m.role === 'assistant' && m.toolCalls?.some((tc: any) => tc.id === id)) as any
        if (!assistantMsg) continue
        const toolCall = assistantMsg.toolCalls?.find((tc: any) => tc.id === id)
        const funcName = toolCall?.function?.name as string
        const agentTools = new Set(['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool'])
        if (!agentTools.has(funcName)) {
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

        // Fetch complete agent data by slug and sync form
        ;(async () => {
          try {
            const agent = await agentAPI.getBySlug(slugArg)
            if (agent && agentBuilderRef.current) {
              agentBuilderRef.current.updateField('name', agent.name || '')
              if (agent.slug) agentBuilderRef.current.updateField('slug', agent.slug)
              agentBuilderRef.current.updateField('description', agent.description || '')
              agentBuilderRef.current.updateField('model', agent.model || '')
              agentBuilderRef.current.updateField('systemPrompt', agent.systemPrompt || '')
              if (agent.temperature !== undefined) agentBuilderRef.current.updateField('temperature', agent.temperature as any)
              if (agent.maxTokens !== undefined) agentBuilderRef.current.updateField('maxTokens', agent.maxTokens as any)
              if (agent.timeout !== undefined) agentBuilderRef.current.updateField('timeout', agent.timeout as any)
              if (Array.isArray((agent as any).assignedToolSlugs)) agentBuilderRef.current.updateField('assignedToolSlugs', (agent as any).assignedToolSlugs as any)
              if (agent.blueprint) agentBuilderRef.current.updateField('blueprint', JSON.stringify(agent.blueprint, null, 2))
              if ((agent as any).icon) agentBuilderRef.current.updateField('icon', (agent as any).icon)
            }
            // If we are currently at /agent/new, replace URL with real slug
            if (!routeUpdatedRef.current && agentSlug === 'new' && typeof slugArg === 'string' && slugArg) {
              const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
              router.replace(`/ship/${slug}/agent/${encodeURIComponent(slugArg)}${q}`)
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
  }, [conversationId, liveMessages, agentSlug, slug, router])
  // Detect tool creation via streaming and navigate to tool page
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

    // Tool-related tool slugs to monitor
    const toolRelatedSlugs = new Set([
      'tool-open',
      'tool-edit',
      'tool-add-blueprint-node',
      'tool-remove-blueprint-node',
      'tool-add-blueprint-edge',
      'tool-remove-blueprint-edge',
      'tool-update-node',
      'tool-assign-mcp',
      'tool-unassign-mcp',
    ])

    // Process only NEW messages (those after initial count)
    const newMessages = liveMessages.slice(initialMessageCountRef.current)

    for (const msg of newMessages as any[]) {
      if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue

      for (const toolCall of msg.toolCalls as any[]) {
        const funcName = toolCall?.function?.name as string | undefined
        if (!funcName || !toolRelatedSlugs.has(funcName)) continue

        // Parse arguments
        let args: any = toolCall?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {
            // ignore parse errors
          }
        }

        // Extract tool slug from arguments (check both slug and toolSlug, default to 'new')
        const toolSlug = args?.slug || args?.toolSlug || 'new'

        // Don't navigate if we're somehow trying to navigate to ourselves
        if (toolSlug === agentSlug) {
          continue
        }

        // Construct URL with conversationId query param if present
        const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
        router.push(`/ship/${slug}/tool/${encodeURIComponent(toolSlug)}${q}`)
        return
      }
    }
  }, [conversationId, liveMessages, slug, router, agentSlug])

  // Prefill when editing an existing agent
  useEffect(() => {
    const doPrefill = async () => {
      if (!agentSlug || agentSlug === 'new') return
      try {
        console.debug('[AgentBuilder] Prefill start', { agentSlug })
        const agent = await agentAPI.getBySlug(agentSlug)
        if (agent && agentBuilderRef.current) {
          console.debug('[AgentBuilder] Prefill fetched agent', { id: agent.id, slug: agent.slug })
          agentBuilderRef.current.updateField('name', agent.name || '')
          if (agent.slug) agentBuilderRef.current.updateField('slug', agent.slug)
          if (agent.description) agentBuilderRef.current.updateField('description', agent.description)
          if (agent.model) agentBuilderRef.current.updateField('model', agent.model)
          if (agent.systemPrompt) agentBuilderRef.current.updateField('systemPrompt', agent.systemPrompt)
          if (agent.temperature !== undefined) agentBuilderRef.current.updateField('temperature', agent.temperature as any)
          if (agent.maxTokens !== undefined) agentBuilderRef.current.updateField('maxTokens', agent.maxTokens as any)
          if (agent.timeout !== undefined) agentBuilderRef.current.updateField('timeout', agent.timeout as any)
          if (Array.isArray((agent as any).assignedToolSlugs)) agentBuilderRef.current.updateField('assignedToolSlugs', (agent as any).assignedToolSlugs as any)
          if (agent.blueprint) agentBuilderRef.current.updateField('blueprint', JSON.stringify(agent.blueprint, null, 2))
          if ((agent as any).icon) agentBuilderRef.current.updateField('icon', (agent as any).icon)
        }
      } catch {
        console.warn('[AgentBuilder] Prefill failed', { agentSlug })
        // If fetch fails, keep an empty/new form
      }
    }
    doPrefill()
  }, [agentSlug])

  // Detect agent creation via streaming completion and replace URL when slug becomes available
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !agentBuilderRef.current) return

    // Look at last few messages for tool results associated with agent-* calls
    const recentMessages = (liveMessages as any[]).slice(-10)
    for (const msg of recentMessages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        const id = msg.toolCallId as string
        // Find the assistant tool call corresponding to this tool result
        const assistantMsg = (liveMessages as any[]).find(m => m.role === 'assistant' && m.toolCalls?.some((tc: any) => tc.id === id)) as any
        if (!assistantMsg) continue
        const toolCall = assistantMsg.toolCalls?.find((tc: any) => tc.id === id)
        const funcName = toolCall?.function?.name as string
        const agentTools = ['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool']
        if (!agentTools.includes(funcName)) continue
        let args: any = toolCall?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {
            // ignore
          }
        }
        const slugArg = args?.slug
        if (agentSlug === 'new' && typeof slugArg === 'string' && slugArg && !routeUpdatedRef.current) {
          const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
          router.replace(`/ship/${slug}/agent/${encodeURIComponent(slugArg)}${q}`)
          routeUpdatedRef.current = true
          break
        }
      }
    }
  }, [conversationId, liveMessages, agentSlug, slug, router])

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
      <AgentBuilderView ref={agentBuilderRef} starshipId={starship.id} onCancel={handleCancel} initialSlug={agentSlug !== 'new' ? String(agentSlug) : undefined} />
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
