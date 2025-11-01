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
import type { MessageModel } from '@starships/protocol'
import type { LlmToolCall } from '@starships/autopilot'

export default function AgentBuilderPage(): React.JSX.Element | null {
  const { slug, agentSlug } = useParams<{ slug: string; agentSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, true)
  const agentBuilderRef = useRef<AgentBuilderViewRef>(null)
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const routeUpdatedRef = useRef<boolean>(false)
  const conversationId = searchParams.get('conversationId') || null
  const [agentOpenError, setAgentOpenError] = useState<string | null>(null)
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

  // Track last applied args per toolCall id for incremental updates during streaming
  const lastAppliedArgsByToolCallIdRef = useRef<Map<string, string>>(new Map())

  // After tool execution completes, fetch and sync agent data once
  const processedToolResultIdsRef = useRef<Set<string>>(new Set())

  // Track initial message count to only process NEW messages (prevents infinite loop on remount)
  const initialMessageCountRef = useRef<number | null>(null)
  // Separate initial count for tool navigation to avoid cross-effect interference
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

  // Ensure slug is present in form ASAP so downstream effects can resolve agentId
  useEffect(() => {
    if (!agentBuilderRef.current) return
    if (agentSlug && agentSlug !== 'new') {
      agentBuilderRef.current.updateField('slug', String(agentSlug))
    }
  }, [agentSlug])

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
        const agentToolSlugFragments = ['open-agent', 'edit-agent', 'assign-agent-tool', 'unassign-agent-tool']
        if (!agentToolSlugFragments.some(s => (funcName || '').toLowerCase().includes(s))) {
          processedToolResultIdsRef.current.add(id)
          continue
        }

        // Extract slug strictly from tool result HTTP response shape: body.data.slug; collect error, if any
        let slugArg: string | undefined
        let errorText: string | undefined
        {
          const content = typeof msg.content === 'string' ? String(msg.content).trim() : ''
          if (content) {
            try {
              const parsed = JSON.parse(content) as Record<string, unknown>
              const body = parsed.body as Record<string, unknown> | undefined
              const data = body && typeof body === 'object' ? (body.data as Record<string, unknown> | undefined) : undefined
              const slugVal = data && typeof data.slug === 'string' ? (data.slug as string) : undefined
              slugArg = slugVal
              if (!slugVal) {
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
        // Fallbacks when slug is not present in tool result body
        if (!slugArg || typeof slugArg !== 'string') {
          const fn = (funcName || '').toLowerCase()
          if (fn.includes('open-agent') && agentSlug === 'new' && !routeUpdatedRef.current && errorText) {
            setAgentOpenError(errorText || 'Failed to open agent')
          }
          // Try to derive slug from the assistant tool call arguments (assign/unassign flows often omit body slug)
          if (!slugArg) {
            try {
              let args: any = toolCall?.function?.arguments
              if (typeof args === 'string') {
                try {
                  args = JSON.parse(args)
                } catch {}
              }
              const fromArgs = args?.slug || args?.agentSlug
              if (typeof fromArgs === 'string' && fromArgs) {
                slugArg = fromArgs
              }
            } catch {}
          }
          // Final fallback to current route slug if editing an existing agent
          if (!slugArg && agentSlug && agentSlug !== 'new') {
            slugArg = String(agentSlug)
          }
          // If we still don't have a slug, mark processed and skip; otherwise proceed to fetch
          if (!slugArg) {
            processedToolResultIdsRef.current.add(id)
            continue
          }
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
              setAgentOpenError(null)
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
    const toolRelatedFragments = [
      'open-tool',
      'edit-tool',
      'add-tool-blueprint-node',
      'add-tool-blueprint-edge',
      'edit-tool-blueprint-node',
      'remove-tool-blueprint-node',
      'edit-tool-blueprint-edge',
      'remove-tool-blueprint-edge',
    ]

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
      <AgentBuilderView
        ref={agentBuilderRef}
        starshipId={starship.id}
        onCancel={handleCancel}
        initialSlug={agentSlug !== 'new' ? String(agentSlug) : undefined}
        errorMessage={agentOpenError || undefined}
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
