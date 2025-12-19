'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse, AgentModel } from '@starships/protocol'
import type { MessageModel } from '@starships/protocol'
import type { LlmToolCall } from '@starships/autopilot'

import { AgentBuilderView, AgentBuilderViewRef } from '@/components/agents/AgentBuilder'
import { AgentCreatedModal } from '@/components/agents/AgentCreatedModal'
import { ToolCreatedModal } from '@/components/tools/ToolCreatedModal'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import type { ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { useConversationStreamContext } from '@/hooks/ConversationStreamContext'
import { useStarshipBySlug } from '@/hooks/useStarships'
import api, { agentAPI } from '@/lib/api'
import { AGENT_QUERY_KEYS, useAgentBySlugOrId, useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents } from '@/hooks/useConversations'
import { useDeferredAgentCreationModal } from '@/hooks/useDeferredAgentCreationModal'
import { useDeferredToolCreationModal } from '@/hooks/useDeferredToolCreationModal'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

export default function AgentBuilderPage(): React.JSX.Element | null {
  const { slug, agentSlug } = useParams<{ slug: string; agentSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, true)
  const agentBuilderRef = useRef<AgentBuilderViewRef>(null)
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const routeUpdatedRef = useRef<boolean>(false)
  const creationFlowActiveRef = useRef<boolean>(false)
  const queryClient = useQueryClient()
  const conversationId = searchParams.get('conversationId') || null
  const [agentOpenError, setAgentOpenError] = useState<string | null>(null)
  const { data: agents = [] } = useStarshipAgents(starship?.id || '', !!starship?.id)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const selectedAgent = useMemo(() => {
    if (convAgents && convAgents.length > 0) return convAgents[0]
    return agents[0] || null
  }, [convAgents, agents])

  // Keep conversation streaming state via the ship-layout provider
  const { messages: liveMessages = [], isResponding } = useConversationStreamContext()
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

  // Track applied tool call keys to avoid duplicate writes
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())

  // Track last applied args per toolCall id for incremental updates during streaming
  const lastAppliedArgsByToolCallIdRef = useRef<Map<string, string>>(new Map())

  // After tool execution completes, fetch and sync agent data once
  const processedToolResultIdsRef = useRef<Set<string>>(new Set())

  // Track initial message count to only process NEW messages (prevents infinite loop on remount)
  const initialMessageCountRef = useRef<number | null>(null)
  // Separate initial count for tool navigation to avoid cross-effect interference
  const toolNavInitialCountRef = useRef<number | null>(null)
  const agentNavInitialCountRef = useRef<number | null>(null)

  const setCreationFlowFlag = (on: boolean) => {
    try {
      if (!conversationId) return
      const key = `agentCreationFlow:${conversationId}`
      if (typeof window === 'undefined' || !window.sessionStorage) return
      if (on) window.sessionStorage.setItem(key, JSON.stringify({ ts: Date.now() }))
      else window.sessionStorage.removeItem(key)
    } catch {}
  }

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

  // Manage creation-flow guard across route transitions within the same turn
  useEffect(() => {
    try {
      if (!conversationId) return
      const key = `agentCreationFlow:${conversationId}`
      if (typeof window === 'undefined' || !window.sessionStorage) return
      if (!isResponding) {
        window.sessionStorage.removeItem(key)
        creationFlowActiveRef.current = false
      } else {
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

  // Stream agent arguments into builder as they arrive (only while streaming)
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !agentBuilderRef.current) return

    // On first render, record initial message count (but don't early-return; allow bootstrap on /agent/new)
    if (initialMessageCountRef.current === null) {
      initialMessageCountRef.current = liveMessages.length
    }

    // Only process if new messages have arrived; however, on /agent/new allow
    // a one-time interception of the current in-flight assistant tool call
    // that may have started before mount.
    // Only intercept while assistant is actively responding
    const allowWhileStreaming = isResponding === true
    if (!allowWhileStreaming) {
      return
    }

    // Eligible tool slugs that should drive the Agent Builder
    const builderToolSlugFragments = ['open-agent', 'edit-agent', 'assign-agent-tool', 'unassign-agent-tool']

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

    const stableStringify = (input: unknown): string => {
      const sorter = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(sorter)
        if (value && typeof value === 'object') {
          const obj = value as Record<string, unknown>
          const keys = Object.keys(obj).sort()
          const out: Record<string, unknown> = {}
          for (const k of keys) out[k] = sorter(obj[k])
          return out
        }
        return value
      }
      try {
        return JSON.stringify(sorter(input))
      } catch {
        try {
          return JSON.stringify(input)
        } catch {
          return ''
        }
      }
    }

    // No partial JSON extraction on client; server guarantees parsed objects

    // Collect only new toolCalls across assistant messages since mount in chronological order
    // While streaming, prefer the most recent assistant message that already has toolCalls
    let considerationMessages: MessageModel[] = []
    const list = liveMessages as MessageModel[]
    let picked: MessageModel | null = null
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (m.role === 'assistant' && Array.isArray((m as any).toolCalls) && (m as any).toolCalls.length > 0) {
        picked = m
        break
      }
    }
    if (!picked) {
      // Fallback: use the most recent assistant shell
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i]
        if (m.role === 'assistant') {
          picked = m
          break
        }
      }
    }
    if (picked) considerationMessages = [picked]
    const newCalls: { name: string; args: unknown }[] = []
    try {
      console.debug('[AgentBuilderStream] scan:start', {
        considerationCount: considerationMessages.length,
        sampleIds: considerationMessages.slice(-3).map(m => m.id),
      })
    } catch {}
    for (let mi = 0; mi < considerationMessages.length; mi++) {
      const msg = considerationMessages[mi]
      if (msg.role !== 'assistant') continue
      const calls = msg.toolCalls as LlmToolCall[] | undefined
      if (!Array.isArray(calls)) {
        try {
          console.debug('[AgentBuilderStream] no-toolCalls', { msgId: (msg as any).id })
        } catch {}
        continue
      }
      for (let ci = 0; ci < calls.length; ci++) {
        const call = calls[ci]
        const rawName = call?.function?.name
        const nameLc = typeof rawName === 'string' ? rawName.toLowerCase() : ''
        try {
          console.debug('[AgentBuilderStream] toolCall', { idx: ci, id: call?.id, name: rawName, nameLc, hasArgs: !!call?.function?.arguments })
        } catch {}
        if (!builderToolSlugFragments.some(s => nameLc.includes(s))) continue
        const raw = (call as any)?.function?.arguments as unknown
        const callId = typeof call?.id === 'string' ? call.id : undefined
        const key = `${nameLc}|${typeof raw === 'string' ? String(raw) : JSON.stringify(raw ?? null)}`
        // Incremental gating: if we have a toolCallId, compare last applied args snapshot
        if (callId) {
          let parsedForCompare: unknown = raw
          if (typeof parsedForCompare === 'string') {
            try {
              parsedForCompare = JSON.parse(parsedForCompare)
            } catch {}
          }
          const snapshot = stableStringify(parsedForCompare)
          const last = lastAppliedArgsByToolCallIdRef.current.get(callId)
          if (last && last === snapshot) {
            // No change since last application
            continue
          }
          // Proceed and update snapshot after applying
        } else {
          // Legacy dedupe for calls without id
          if (appliedToolCallKeysRef.current.has(key)) continue
        }
        // parse args after key computation to keep key stable on parse errors
        let parsed: unknown = raw
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed as string)
          } catch {}
        }
        try {
          const preview = typeof parsed === 'object' && parsed ? Object.keys(parsed as Record<string, unknown>).slice(0, 6) : typeof parsed
          console.debug('[AgentBuilderStream] args-parsed', { callId, keys: preview })
        } catch {}
        // Allow empty-argument unassign calls to be processed (interpreted as unassign-all)
        if (parsed && typeof parsed === 'object' && Object.keys(parsed as Record<string, unknown>).length === 0) {
          const isUnassignLike = nameLc.includes('unassign-agent-tool')
          if (!isUnassignLike) {
            continue
          }
        }
        newCalls.push({ name: nameLc, args: parsed, id: callId || undefined, snapshot: callId ? stableStringify(parsed) : undefined } as unknown as { name: string; args: unknown })
        if (!callId) appliedToolCallKeysRef.current.add(key)
      }
    }

    if (newCalls.length === 0) {
      try {
        console.debug('[AgentBuilderStream] scan:done:no-new-calls')
      } catch {}
      return
    }

    // Compose pending scalar field updates
    const compose = {
      name: undefined as undefined | string,
      slug: undefined as undefined | string,
      description: undefined as undefined | string,
      category: undefined as undefined | string,
      model: undefined as undefined | string,
      temperature: undefined as undefined | number,
      maxTokens: undefined as undefined | number,
      reasoning: undefined as undefined | string,
      systemPrompt: undefined as undefined | string,
      previewPrompts: undefined as undefined | string[],
      assignedToolSlugs: undefined as undefined | string[],
      icon: undefined as undefined | string,
      timeout: undefined as undefined | number,
      blueprintChanged: false,
    }

    const hasContent = (b: any) => (Array.isArray(b?.nodes) && b.nodes.length > 0) || (Array.isArray(b?.edges) && b.edges.length > 0)

    // Apply each new call in order
    for (const call of newCalls as Array<{ name: string; args: unknown; id?: string; snapshot?: string }>) {
      const rawToolName = call.name
      const nameLc = typeof rawToolName === 'string' ? rawToolName.toLowerCase() : ''
      const args = call.args as Record<string, unknown> | undefined

      if (nameLc.startsWith('open-agent') || nameLc.startsWith('edit-agent')) {
        // Flatten common nesting shapes: { agent: {...} } or { data: {...} } or { payload: {...} }
        let src: any = args && typeof args === 'object' ? (args as any) : undefined
        if (src && typeof src === 'object') {
          if (src.agent && typeof src.agent === 'object') src = src.agent
          else if (src.data && typeof src.data === 'object') src = src.data
          else if (src.payload && typeof src.payload === 'object') src = src.payload
        }
        // Fallback to original args if no nesting matched
        if (!src || typeof src !== 'object') src = args

        if (typeof src?.name === 'string') compose.name = src.name
        if (typeof src?.slug === 'string') compose.slug = src.slug
        if (typeof src?.description === 'string') compose.description = src.description
        if (typeof src?.category === 'string') compose.category = src.category
        if (typeof src?.model === 'string') compose.model = src.model
        if (typeof src?.temperature === 'number') compose.temperature = src.temperature
        if (typeof src?.maxTokens === 'number') compose.maxTokens = src.maxTokens
        if (src?.reasoning !== undefined) {
          const tryCoerceEffort = (v: unknown): string | undefined => {
            if (typeof v === 'string') {
              const s = v.trim().toLowerCase()
              if (s === 'none' || s === 'low' || s === 'medium' || s === 'high') return s
              // Sometimes tools send JSON as string
              try {
                const parsed = JSON.parse(v)
                return tryCoerceEffort(parsed)
              } catch {
                return undefined
              }
            }
            if (v && typeof v === 'object') {
              const effort = (v as any).effort
              if (typeof effort === 'string') {
                const s = effort.trim().toLowerCase()
                if (s === 'low' || s === 'medium' || s === 'high') return s
              }
            }
            return undefined
          }
          const effort = tryCoerceEffort(src.reasoning)
          if (effort) compose.reasoning = effort
        }
        if (typeof src?.systemPrompt === 'string') compose.systemPrompt = src.systemPrompt
        if (Array.isArray(src?.previewPrompts)) compose.previewPrompts = (src.previewPrompts as unknown[]).filter(p => typeof p === 'string' && (p as string).trim()).slice(0, 10) as string[]
        if (typeof src?.icon === 'string') compose.icon = src.icon
        if (typeof src?.timeout === 'number') compose.timeout = src.timeout

        // If slug not provided in args, derive from function name suffix: open-agent-<slug> / edit-agent-<slug>
        if (!compose.slug) {
          if (nameLc.startsWith('open-agent-')) compose.slug = nameLc.slice('open-agent-'.length)
          else if (nameLc.startsWith('edit-agent-')) compose.slug = nameLc.slice('edit-agent-'.length)
        }

        // Do not apply assignedToolSlugs from streaming arguments. We only
        // reflect tool assignments after confirmed tool completion and a
        // fresh fetch from the server.
        if (src && typeof src === 'object' && !Array.isArray(src) && 'blueprint' in src) {
          const rawBp = (src as Record<string, unknown>).blueprint
          const incoming = normalizeJson(rawBp)
          if (!incoming || typeof incoming !== 'object') {
            // Skip until we have an object blueprint
            if (call.id && call.snapshot !== undefined) {
              lastAppliedArgsByToolCallIdRef.current.set(call.id, call.snapshot)
            }
            continue
          }
          if (!Array.isArray((incoming as any).nodes)) (incoming as any).nodes = []
          if (!Array.isArray((incoming as any).edges)) (incoming as any).edges = []
          // Only replace blueprint if incoming has content OR current bp is empty
          if (hasContent(incoming as any) || !hasContent(bp)) {
            bp = incoming as any
            compose.blueprintChanged = true
          }
        }
        // Persist latest snapshot for incremental gating
        if (call.id && call.snapshot !== undefined) {
          lastAppliedArgsByToolCallIdRef.current.set(call.id, call.snapshot)
        }
        continue
      }

      // Reflect assign/unassign tool changes during streaming (optimistic UI)
      if (nameLc.includes('assign-agent-tool') || nameLc.includes('unassign-agent-tool')) {
        const src = args && typeof args === 'object' ? (args as any) : undefined
        const collectToolSlugs = (obj: any, currentAgentSlug: string | undefined): string[] => {
          const out = new Set<string>()
          if (!obj || typeof obj !== 'object') return []

          const consider = (val: any) => {
            if (!val) return
            if (typeof val === 'string') {
              const v = val.trim()
              if (v) out.add(v)
              return
            }
            if (Array.isArray(val)) {
              for (const it of val) consider(it)
              return
            }
            if (typeof val === 'object') {
              // object with slug field
              const s = (val as any).slug
              if (typeof s === 'string' && s.trim()) out.add(s.trim())
            }
          }

          // Common arg shapes
          consider((obj as any).toolSlug)
          consider((obj as any).tool)
          consider((obj as any).toolSlugs)
          consider((obj as any).tools)
          // Some tools might just use generic slug/slugs; guard by excluding agent slug later
          consider((obj as any).slug)
          consider((obj as any).slugs)

          // Filter out the agent slug if it snuck in via generic fields
          const results = Array.from(out)
          const agentSlugToFilter = typeof currentAgentSlug === 'string' ? currentAgentSlug : undefined
          return agentSlugToFilter ? results.filter(s => s !== agentSlugToFilter) : results
        }

        const toolSlugs = collectToolSlugs(src, (form as any)?.slug || (typeof agentSlug === 'string' ? agentSlug : undefined))
        if (toolSlugs.length > 0 || nameLc.includes('unassign-agent-tool')) {
          const currentAssigned = Array.isArray((form as any).assignedToolSlugs) ? ([...(form as any).assignedToolSlugs] as string[]) : []
          const setAssigned = new Set<string>(currentAssigned)
          if (nameLc.includes('assign-agent-tool')) {
            for (const s of toolSlugs) setAssigned.add(s)
          } else {
            if (toolSlugs.length === 0) {
              // Interpret missing slugs on unassign as "unassign all"
              setAssigned.clear()
            } else {
              for (const s of toolSlugs) setAssigned.delete(s)
            }
          }
          compose.assignedToolSlugs = Array.from(setAssigned)
        }
        if (call.id && call.snapshot !== undefined) {
          lastAppliedArgsByToolCallIdRef.current.set(call.id, call.snapshot)
        }
        continue
      }
    }

    // Write back composed updates once
    try {
      console.debug('[AgentBuilderStream] apply:compose', {
        name: compose.name,
        slug: compose.slug,
        model: compose.model,
        temperature: compose.temperature,
        maxTokens: compose.maxTokens,
        timeout: compose.timeout,
        blueprintChanged: compose.blueprintChanged,
      })
    } catch {}
    if (compose.name !== undefined) agentBuilderRef.current?.updateField('name', compose.name)
    if (compose.slug !== undefined) agentBuilderRef.current?.updateField('slug', compose.slug)
    if (compose.description !== undefined) agentBuilderRef.current?.updateField('description', compose.description)
    if (compose.category !== undefined) agentBuilderRef.current?.updateField('category', compose.category as any)
    if (compose.model !== undefined) agentBuilderRef.current?.updateField('model', compose.model)
    if (compose.temperature !== undefined) agentBuilderRef.current?.updateField('temperature', compose.temperature as any)
    if (compose.maxTokens !== undefined) agentBuilderRef.current?.updateField('maxTokens', compose.maxTokens as any)
    if (compose.reasoning !== undefined) agentBuilderRef.current?.updateField('reasoning', compose.reasoning)
    if (compose.systemPrompt !== undefined) agentBuilderRef.current?.updateField('systemPrompt', compose.systemPrompt)
    if (compose.icon !== undefined) agentBuilderRef.current?.updateField('icon', compose.icon)
    if (compose.timeout !== undefined) agentBuilderRef.current?.updateField('timeout', compose.timeout as any)
    if (compose.assignedToolSlugs !== undefined) agentBuilderRef.current?.updateField('assignedToolSlugs', compose.assignedToolSlugs as any)
    if (compose.previewPrompts !== undefined) agentBuilderRef.current?.updateField('previewPrompts', compose.previewPrompts as any)
    if (compose.blueprintChanged) {
      const bpStr = JSON.stringify(bp, null, 2)
      agentBuilderRef.current?.updateField('blueprint', bpStr)
    }
  }, [conversationId, liveMessages, isResponding])

  // After agent tool execution completes, fetch and sync agent data once (and surface creation errors)
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
    const recentMessages = (liveMessages as MessageModel[]).slice(initialMessageCountRef.current)

    for (const msg of recentMessages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        const id = msg.toolCallId as string
        if (processedToolResultIdsRef.current.has(id)) continue

        // Find the assistant tool call corresponding to this tool result
        const assistantMsg = (liveMessages as MessageModel[]).find(m => m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.some((tc: LlmToolCall) => tc.id === id))
        if (!assistantMsg) continue
        const toolCall = assistantMsg.toolCalls?.find((tc: LlmToolCall) => tc.id === id)
        const funcName = toolCall?.function?.name as string
        const agentToolSlugFragments = ['open-agent', 'edit-agent']
        if (!agentToolSlugFragments.some(s => (funcName || '').toLowerCase().includes(s))) {
          processedToolResultIdsRef.current.add(id)
          continue
        }

        // Extract slug strictly from tool result HTTP response shape; collect error, if any
        let slugArg: string | undefined
        let errorText: string | undefined
        {
          const content = typeof msg.content === 'string' ? String(msg.content).trim() : ''
          if (content) {
            try {
              const parsed = JSON.parse(content) as Record<string, unknown>
              const body = parsed.body as Record<string, unknown> | undefined
              const data = body && typeof body === 'object' ? (body.data as Record<string, unknown> | undefined) : undefined
              const candidates: Array<string | undefined> = [
                typeof (parsed as any)?.slug === 'string' ? ((parsed as any).slug as string) : undefined,
                typeof (parsed as any)?.agent?.slug === 'string' ? ((parsed as any).agent.slug as string) : undefined,
                typeof data?.slug === 'string' ? (data.slug as string) : undefined,
                typeof (data as any)?.agent?.slug === 'string' ? ((data as any).agent.slug as string) : undefined,
                typeof (body as any)?.slug === 'string' ? ((body as any).slug as string) : undefined,
                typeof (body as any)?.agent?.slug === 'string' ? ((body as any).agent.slug as string) : undefined,
              ]
              const found = candidates.find(s => typeof s === 'string' && s.trim())
              if (found) slugArg = found as string
              if (!slugArg) {
                const pickFirstString = (arr: unknown[]): string | undefined => {
                  for (const item of arr) {
                    if (typeof item === 'string' && item) return item
                    if (item && typeof item === 'object') {
                      const o = item as Record<string, unknown>
                      const m = (o.message as string) || (o.msg as string) || (o.description as string)
                      if (typeof m === 'string' && m) return m
                    }
                  }
                  return undefined
                }
                const maybeError = (body && (body as any).error) || (parsed as any).error
                const maybeMessage = (body && (body as any).message) || (parsed as any).message
                const maybeDataError = data && (data as any).error
                const statusCode = (parsed as any).statusCode || (parsed as any).status

                if (typeof maybeError === 'string' && maybeError) {
                  errorText = maybeError
                } else if (maybeError && typeof maybeError === 'object') {
                  const errObj = maybeError as Record<string, unknown>
                  errorText = (errObj.message as string) || (errObj.description as string) || undefined
                  if (!errorText) {
                    const arr = (errObj.errors as unknown[]) || (errObj.details as unknown[]) || (errObj.issues as unknown[])
                    if (Array.isArray(arr)) errorText = pickFirstString(arr)
                  }
                }
                if (!errorText && typeof maybeMessage === 'string' && maybeMessage) {
                  errorText = maybeMessage
                }
                if (!errorText && maybeDataError) {
                  if (typeof maybeDataError === 'string') errorText = maybeDataError
                  else if (typeof maybeDataError === 'object') {
                    const de = maybeDataError as Record<string, unknown>
                    errorText = (de.message as string) || (de.description as string) || undefined
                    if (!errorText) {
                      const arr = (de.errors as unknown[]) || (de.details as unknown[]) || (de.issues as unknown[])
                      if (Array.isArray(arr)) errorText = pickFirstString(arr)
                    }
                  }
                }
                if (!errorText && statusCode && Number(statusCode) >= 400) {
                  errorText = 'Failed to open agent'
                }
              }
            } catch {}
          }
        }
        // If slug not present in tool result body, do not guess from args; wait for proper result
        if (!slugArg || typeof slugArg !== 'string') {
          const fn = (funcName || '').toLowerCase()
          if (fn.includes('open-agent') && agentSlug === 'new' && !routeUpdatedRef.current && errorText) {
            setAgentOpenError(errorText || 'Failed to open agent')
          }
          processedToolResultIdsRef.current.add(id)
          continue
        }

        // Fetch complete agent data by slug and sync form via TanStack Query
        ;(async () => {
          try {
            await queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.bySlugOrId(slugArg as string), exact: true })
            const agent = await queryClient.fetchQuery({
              queryKey: AGENT_QUERY_KEYS.bySlugOrId(slugArg as string),
              queryFn: async (): Promise<AgentModel> => {
                const res: FetchResponse<ApiResponse<AgentModel>> = await api.get(`/api/v1/agents/${encodeURIComponent(slugArg as string)}`)
                return res.data.data
              },
              staleTime: 30 * 1000,
            })
            if (agent && agentBuilderRef.current) {
              agentBuilderRef.current.updateField('name', agent.name || '')
              if (agent.slug) agentBuilderRef.current.updateField('slug', agent.slug)
              agentBuilderRef.current.updateField('description', agent.description || '')
              agentBuilderRef.current.updateField('model', agent.model || '')
              const effort = (agent as any)?.reasoning?.effort
              if (typeof effort === 'string' && (effort === 'low' || effort === 'medium' || effort === 'high')) {
                agentBuilderRef.current.updateField('reasoning', effort)
              } else {
                agentBuilderRef.current.updateField('reasoning', 'none' as any)
              }
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
              setAgentOpenError(null)
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
  }, [conversationId, liveMessages, agentSlug, slug, router])

  // While streaming, navigate to a different agent when relevant agent calls target another slug
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !isResponding) return

    // On first render, record baseline and skip processing
    if (agentNavInitialCountRef.current === null) {
      agentNavInitialCountRef.current = liveMessages.length
      return
    }

    // Only process newly arrived messages
    if (liveMessages.length <= (agentNavInitialCountRef.current as number)) return

    const agentBuilderSlugFragments = ['open-agent', 'edit-agent', 'assign-agent-tool', 'unassign-agent-tool']

    const newMessages = (liveMessages as any[]).slice(agentNavInitialCountRef.current as number)
    for (const msg of newMessages) {
      if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue
      for (const toolCall of msg.toolCalls as any[]) {
        const funcName = toolCall?.function?.name as string | undefined
        const funcNameLc = typeof funcName === 'string' ? funcName.toLowerCase() : ''
        if (!funcNameLc) continue
        if (!agentBuilderSlugFragments.some(s => funcNameLc.includes(s))) continue

        // Parse arguments to extract next agent slug/name
        let args: any = toolCall?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {}
        }
        const src = args && typeof args === 'object' ? (args as any) : undefined
        const nested = src?.agent || src?.data || src?.payload || src
        const nestedSlug = nested && typeof nested.slug === 'string' && nested.slug.trim() ? String(nested.slug) : undefined
        const altAgentSlug = typeof src?.agentSlug === 'string' && src.agentSlug.trim() ? String(src.agentSlug) : undefined
        const maybeName = nested && typeof nested.name === 'string' && nested.name.trim() ? String(nested.name) : undefined
        const nextAgentSlug: string | undefined = nestedSlug || altAgentSlug

        // Only navigate to explicit slug for edit-agent (avoid open-agent misrouting to caller)
        if (funcNameLc.includes('edit-agent') && nextAgentSlug && nextAgentSlug !== agentSlug && !creationFlowActiveRef.current) {
          const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
          agentNavInitialCountRef.current = liveMessages.length
          router.push(`/ship/${slug}/agent/${encodeURIComponent(nextAgentSlug)}${q}`)
          return
        }

        // If open-agent without slug, go to /agent/new and set creation flag
        if (!nextAgentSlug && funcNameLc.includes('open-agent') && agentSlug !== 'new') {
          const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
          agentNavInitialCountRef.current = liveMessages.length
          creationFlowActiveRef.current = true
          setCreationFlowFlag(true)
          router.push(`/ship/${slug}/agent/new${q}`)
          return
        }

        // If edit-agent with name but no slug, resolve via starship agents list and navigate
        if (!nextAgentSlug && funcNameLc.includes('edit-agent') && maybeName && starship?.id) {
          ;(async () => {
            try {
              const list = await queryClient.fetchQuery({
                queryKey: AGENT_QUERY_KEYS.byStarship(starship.id),
                queryFn: async (): Promise<AgentModel[]> => {
                  const response: FetchResponse<ApiResponse<AgentModel[]>> = await api.get(`/api/v1/starships/${starship.id}/agents`)
                  return response.data.data
                },
                staleTime: 30 * 1000,
              })
              const match = (list || []).find(a => String(a?.name || '').toLowerCase() === maybeName.toLowerCase())
              const slugFound = match && typeof (match as any).slug === 'string' ? String((match as any).slug) : undefined
              if (slugFound && slugFound !== agentSlug) {
                const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
                agentNavInitialCountRef.current = liveMessages.length
                router.push(`/ship/${slug}/agent/${encodeURIComponent(slugFound)}${q}`)
              }
            } catch {}
          })()
          return
        }
      }
    }
  }, [conversationId, isResponding, liveMessages, router, slug, agentSlug, starship?.id])
  // Detect tool-related calls while streaming and navigate to Tool Builder
  useEffect(() => {
    if (!conversationId || !liveMessages.length || !isResponding) return

    // On first render, record initial message count and don't process
    if (toolNavInitialCountRef.current === null) {
      toolNavInitialCountRef.current = liveMessages.length
      return
    }

    // Only process if new messages have arrived
    if (liveMessages.length <= toolNavInitialCountRef.current) {
      return
    }

    // Tool-related fragments to monitor (align with ConversationInterface)
    const toolRelatedFragments = ['open-tool', 'edit-tool', 'modify-tool-blueprint-node', 'modify-tool-blueprint-edge']

    // Process only NEW messages (those after initial count)
    const newMessages = liveMessages.slice(toolNavInitialCountRef.current)

    for (const msg of newMessages as any[]) {
      if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue

      for (const toolCall of msg.toolCalls as any[]) {
        const funcName = toolCall?.function?.name as string | undefined
        const funcNameLc = typeof funcName === 'string' ? funcName.toLowerCase() : ''
        if (!funcNameLc) continue
        if (!(toolRelatedFragments.some(s => funcNameLc.includes(s)) || funcNameLc.includes('tool-blueprint-'))) continue

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
        const nextToolSlug: string = args?.slug || args?.toolSlug || 'new'

        // Don't navigate if we're somehow trying to navigate to ourselves
        if (nextToolSlug === agentSlug) {
          continue
        }

        // Construct URL with conversationId query param if present
        const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
        router.push(`/ship/${slug}/tool/${encodeURIComponent(nextToolSlug)}${q}`)
        return
      }
    }
  }, [conversationId, liveMessages, slug, router, agentSlug, isResponding])

  // Prefill when editing an existing agent via TanStack Query
  const { data: existingAgent } = useAgentBySlugOrId(agentSlug || '', !!agentSlug && agentSlug !== 'new')
  useEffect(() => {
    if (!existingAgent || !agentBuilderRef.current) return
    try {
      console.debug('[AgentBuilder] Prefill fetched agent', { id: existingAgent.id, slug: existingAgent.slug })
    } catch {}
    agentBuilderRef.current.updateField('name', existingAgent.name || '')
    if (existingAgent.slug) agentBuilderRef.current.updateField('slug', existingAgent.slug)
    if (existingAgent.description) agentBuilderRef.current.updateField('description', existingAgent.description)
    if (existingAgent.model) agentBuilderRef.current.updateField('model', existingAgent.model)
    {
      const effort = (existingAgent as any)?.reasoning?.effort
      if (typeof effort === 'string' && (effort === 'low' || effort === 'medium' || effort === 'high')) {
        agentBuilderRef.current.updateField('reasoning', effort)
      } else {
        agentBuilderRef.current.updateField('reasoning', 'none' as any)
      }
    }
    if (existingAgent.systemPrompt) agentBuilderRef.current.updateField('systemPrompt', existingAgent.systemPrompt)
    if (existingAgent.temperature !== undefined) agentBuilderRef.current.updateField('temperature', existingAgent.temperature as any)
    if (existingAgent.maxTokens !== undefined) agentBuilderRef.current.updateField('maxTokens', existingAgent.maxTokens as any)
    if (existingAgent.timeout !== undefined) agentBuilderRef.current.updateField('timeout', existingAgent.timeout as any)
    if (Array.isArray((existingAgent as any).assignedToolSlugs)) agentBuilderRef.current.updateField('assignedToolSlugs', (existingAgent as any).assignedToolSlugs as any)
    if (existingAgent.blueprint) agentBuilderRef.current.updateField('blueprint', JSON.stringify(existingAgent.blueprint, null, 2))
    if ((existingAgent as any).icon) agentBuilderRef.current.updateField('icon', (existingAgent as any).icon)
  }, [existingAgent])

  const handleCancel = () => {
    if (conversationId) {
      router.push(`/ship/${slug}/conversations/${conversationId}`)
    } else {
      router.push(`/ship/${slug}/conversations`)
    }
  }

  const headerAgentName = existingAgent?.name || (selectedAgent as any)?.name || (agentSlug === 'new' ? 'New agent' : String(agentSlug))

  const headerAgentSubtitle = existingAgent?.slug || (selectedAgent as any)?.slug || (agentSlug !== 'new' ? String(agentSlug) : undefined)
  const headerAvatarAttachmentId = ((existingAgent as any)?.avatarAttachmentId ?? (selectedAgent as any)?.avatarAttachmentId) as string | undefined
  const headerAvatarIds = useMemo(() => (headerAvatarAttachmentId ? [headerAvatarAttachmentId] : []), [headerAvatarAttachmentId])
  const { data: headerAvatarAttachments = [] } = useMessageAttachments(headerAvatarIds, starship?.id)
  const headerAvatarUrl = headerAvatarAttachments?.[0]?.previewUrl

  if (!starship?.id) return null

  return (
    <div className="bg-background min-h-screen">
      <div className="flex flex-col items-center px-6 py-6">
        <div className="w-full max-w-6xl mx-auto space-y-0">
          {/* Page header - mirrors ship agents/tools overview pages */}
          <div id="agent-page-header" className="text-center mt-10">
            <div className="flex flex-col items-center justify-center gap-2 mb-2">
              <AgentAvatar seed={headerAgentName} imageUrl={headerAvatarUrl} size={112} rounded className="h-28 w-28 rounded-2xl overflow-hidden shadow-lg bg-background/80" />
              <div className="flex flex-col items-center">
                <h1 className="text-3xl sm:text-4xl font-semibold truncate max-w-xs sm:max-w-xl">{headerAgentName}</h1>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href={`/ship/${slug}`} className="font-mono">
                      <Badge variant="outline" className="font-mono text-muted-foreground border-muted-foreground/30 hover:text-foreground">
                        {slug}
                      </Badge>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href={`/ship/${slug}/agents`}>
                      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 hover:text-foreground">
                        Agents
                      </Badge>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      <Badge variant="outline" className="text-foreground">
                        {headerAgentSubtitle || (agentSlug === 'new' ? 'new' : 'details')}
                      </Badge>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>

          <div className="relative w-full rounded-2xl bg-background/80 shadow-sm min-h-[600px] mb-16">
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

            <div className="relative h-full w-full">
              <AgentBuilderView
                ref={agentBuilderRef}
                starshipId={starship.id}
                onCancel={handleCancel}
                initialSlug={agentSlug !== 'new' ? String(agentSlug) : undefined}
                errorMessage={agentOpenError || undefined}
              />

              {conversationId && (
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
