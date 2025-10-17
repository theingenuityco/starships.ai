'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AgentBuilderView, AgentBuilderViewRef } from '@/components/agents/AgentBuilder'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { agentAPI } from '@/lib/api'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useConversationStreamed } from '@/hooks/useConversations'

export default function AgentBuilderPage(): React.JSX.Element | null {
  const { slug, agentSlug } = useParams<{ slug: string; agentSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, true)
  const agentBuilderRef = useRef<AgentBuilderViewRef>(null)
  const routeUpdatedRef = useRef<boolean>(false)
  const conversationId = useMemo(() => searchParams.get('conversationId') || null, [searchParams])
  const { data: agents = [] } = useStarshipAgents(starship?.id || '', !!starship?.id)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const selectedAgent = useMemo(() => {
    if (convAgents && convAgents.length > 0) return convAgents[0]
    return agents[0] || null
  }, [convAgents, agents])

  // Keep conversation streaming active and capture live messages/UI actions
  const { messages: liveMessages = [], isResponding } = useConversationStreamed(conversationId, starship?.id || '')

  // Control the expandable overlay: expand only while streaming; user can toggle
  const [isOverlayExpanded, setIsOverlayExpanded] = useState<boolean>(false)
  useEffect(() => {
    setIsOverlayExpanded(!!isResponding)
  }, [isResponding])

  // Track applied tool call keys to avoid duplicate writes
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())

  // Stream agent arguments into builder as they arrive
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !agentBuilderRef.current) return

    // Eligible tool slugs that should drive the Agent Builder
    const builderToolSlugs = new Set(['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool'])

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
        if (args?.icon !== undefined) compose.icon = args.icon
        if (args?.timeout !== undefined) compose.timeout = args.timeout
        if (args?.assignedToolSlugs !== undefined) {
          compose.assignedToolSlugs = Array.isArray(args.assignedToolSlugs) ? args.assignedToolSlugs : []
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

      // Handle tool assignment/unassignment
      if (toolName === 'agent-assign-tool') {
        const toolSlug = args?.toolSlug
        if (toolSlug && typeof toolSlug === 'string') {
          const current = compose.assignedToolSlugs ?? form.assignedToolSlugs ?? []
          if (!current.includes(toolSlug)) {
            compose.assignedToolSlugs = [...current, toolSlug]
          }
        }
        continue
      }

      if (toolName === 'agent-unassign-tool') {
        const toolSlug = args?.toolSlug
        if (toolSlug && typeof toolSlug === 'string') {
          const current = compose.assignedToolSlugs ?? form.assignedToolSlugs ?? []
          compose.assignedToolSlugs = current.filter(s => s !== toolSlug)
        }
        continue
      }
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
    if (compose.blueprintChanged) {
      const bpStr = JSON.stringify(bp, null, 2)
      agentBuilderRef.current?.updateField('blueprint', bpStr)
    }
  }, [conversationId, liveMessages])

  // Prefill when editing an existing agent
  useEffect(() => {
    const doPrefill = async () => {
      if (!agentSlug || agentSlug === 'new') return
      try {
        const agent = await agentAPI.getBySlug(agentSlug)
        if (agent && agentBuilderRef.current) {
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
      <AgentBuilderView ref={agentBuilderRef} starshipId={starship.id} onCancel={handleCancel} persistenceKey={`${slug}:${agentSlug || 'new'}:${conversationId || 'no-conv'}`} />
      {conversationId && (
        <div className="absolute left-0 right-0 bottom-[22px] px-6 z-30 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <ConversationMessageInput
              selectedAgent={selectedAgent}
              starshipId={starship.id}
              conversationId={conversationId}
              isToolFormOpen={true}
              minimal={true}
              showExpandableOverlay={true}
              isOverlayExpanded={isOverlayExpanded}
              onFocus={() => setIsOverlayExpanded(true)}
              onBlur={() => setIsOverlayExpanded(false)}
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
