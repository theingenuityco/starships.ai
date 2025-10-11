'use client'

import { Sparkles, Users } from 'lucide-react'
import Icon from '@/components/primitives/Icon'

import { AgentSelector } from '@/components/conversation/AgentSelector'
import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ToolBuilderView, ToolBuilderViewRef } from '@/components/tools/ToolBuilder'
import { AgentBuilderView, AgentBuilderViewRef } from '@/components/agents/AgentBuilder'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useConversationStreamed } from '@/hooks/useConversations'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import type { Agent } from '@/lib/api'
import { agentAPI, toolAPI } from '@/lib/api'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationContextBar } from '@/components/conversation/ConversationContextBar'
import { useModelContextLength } from '@/hooks/useOpenRouterModels'
import { toast } from 'sonner'

interface ConversationInterfaceProps {
  starshipId: string
  conversationId?: string | null
  onConversationChange?: (conversationId: string | null) => void
  initialAgentId?: string
}

export function ConversationInterface({ starshipId, conversationId: externalConversationId, onConversationChange, initialAgentId }: ConversationInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()

  // Agent and UI state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const { contextLength: agentContextLength } = useModelContextLength(selectedAgent?.model)
  const budgetTokens = agentContextLength

  // UI state (conversation id only; message presence is derived from store)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)

  // Refs for direct communication with components
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const toolBuilderViewRef = useRef<ToolBuilderViewRef>(null)
  const agentBuilderViewRef = useRef<AgentBuilderViewRef>(null)
  const lastUIActionKeyRef = useRef<string | null>(null)

  // View mode state: 'conversation' or 'tool-builder' or 'agent-builder'
  const [viewMode, setViewMode] = useState<'conversation' | 'tool-builder' | 'agent-builder'>('conversation')
  // Ref to avoid stale closures inside streaming handlers
  const viewModeRef = useRef<'conversation' | 'tool-builder' | 'agent-builder'>('conversation')
  // Track applied tool call keys to accumulate across messages
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())
  // Track last conversation id to reset applied set
  const lastAppliedConversationRef = useRef<string | null>(null)

  // Expanded overlay state for message history when in builder mode
  const [isMessageOverlayExpanded, setIsMessageOverlayExpanded] = useState(false)

  // Track if the builder was opened via streaming UI action
  const wasOpenedByStreamingRef = useRef(false)

  // Track pending tool calls for completion detection
  const pendingToolCallsRef = useRef<Map<string, { toolName: string; args: any; completed?: boolean }>>(new Map())

  // Track streaming state for current conversation to focus input on completion
  const { isStreaming: uiStreaming, messages: liveMessages = [], lastUIAction } = useConversationStreamed(currentConversationId, starshipId)
  const prevStreamingRef = useRef(false)

  // Measure floating input height to reserve scroll space and prevent overlap with the floating composer
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const [inputHeight, setInputHeight] = useState<number>(160)

  // Get agents data from starship and conversation
  const { data: starshipAgentsData = [] } = useStarshipAgents(starshipId || '')
  const { data: conversationAgents = [] } = useConversationAgents(currentConversationId)
  const conversationData = useStarshipUIStore(s => (currentConversationId ? s.conversations[currentConversationId] : undefined))

  // Derive message presence and UI gating from streamed query (not store)
  const hasMessages = Array.isArray(liveMessages) && liveMessages.length > 0
  const showMessagesArea = Boolean(currentConversationId) && (hasMessages || uiStreaming)

  // Measure input container after showMessagesArea is known (prevents TS error and ensures correct layout)
  useEffect(() => {
    const el = inputContainerRef.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      setInputHeight(Math.ceil(rect.height))
    }

    update()

    const ro = new ResizeObserver(() => update())
    ro.observe(el)

    const onResize = () => update()
    window.addEventListener('resize', onResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [showMessagesArea, currentConversationId])

  // Memoized agent change handler to prevent AgentSelector from remounting
  const handleAgentChange = useCallback((agent: Agent | null) => {
    setSelectedAgent(agent)
  }, [])

  // Handle conversation start - receive actual database conversation ID
  const handleConversationStart = useCallback(
    (conversationId: string) => {
      setCurrentConversationId(conversationId)
      onConversationChange?.(conversationId)
    },
    [onConversationChange]
  )

  // Handle suggestion click
  const handleSuggestionClick = useCallback((suggestion: string) => {
    if (messageInputRef.current?.handleSuggestionSubmit) {
      messageInputRef.current.handleSuggestionSubmit(suggestion)
    }
  }, [])

  // Handle overlay toggle when clicking disabled input
  const handleToggleOverlay = useCallback(() => {
    setIsMessageOverlayExpanded(prev => !prev)
  }, [])

  // Reset conversation when external conversation ID changes
  useEffect(() => {
    if (externalConversationId === undefined) return
    setCurrentConversationId(prev => (prev === externalConversationId ? prev : externalConversationId))
  }, [externalConversationId])

  // Handle initial agent selection from URL parameter
  useEffect(() => {
    if (initialAgentId && starshipAgentsData.length > 0 && !selectedAgent) {
      const agent = starshipAgentsData.find(a => a.id === initialAgentId)
      if (agent) {
        setSelectedAgent(agent)
      }
    }
  }, [initialAgentId, starshipAgentsData, selectedAgent])

  // Restore selected agent from conversation data
  useEffect(() => {
    if (!currentConversationId) return

    if (conversationAgents.length > 0) {
      const conversationAgent = conversationAgents[0]
      if (conversationAgent && (!selectedAgent || selectedAgent.id !== conversationAgent.id)) {
        setSelectedAgent(conversationAgent)
        return
      }
    }

    if (conversationData?.agentId && starshipAgentsData.length > 0) {
      const storedAgent = starshipAgentsData.find(agent => agent.id === conversationData.agentId)
      if (storedAgent && (!selectedAgent || selectedAgent.id !== storedAgent.id)) {
        setSelectedAgent(storedAgent)
        return
      }
    }

    if (!selectedAgent && starshipAgentsData.length > 0) {
      setSelectedAgent(starshipAgentsData[0])
    }
  }, [currentConversationId, conversationAgents, conversationData?.agentId, starshipAgentsData, selectedAgent])

  // Keep view mode ref in sync to avoid stale closure issues
  useEffect(() => {
    viewModeRef.current = viewMode
  }, [viewMode])

  // Reset applied tool-calls tracker when conversation changes
  useEffect(() => {
    if (lastAppliedConversationRef.current !== currentConversationId) {
      appliedToolCallKeysRef.current.clear()
      lastAppliedConversationRef.current = currentConversationId ?? null
    }
  }, [currentConversationId])

  // Focus input when streaming transitions from true -> false
  useEffect(() => {
    const was = prevStreamingRef.current
    if (was && !uiStreaming) {
      setTimeout(() => {
        messageInputRef.current?.focusInput?.()
      }, 50)
    }
    prevStreamingRef.current = uiStreaming
  }, [uiStreaming])

  // Focus after first message or when conversation becomes ready
  useEffect(() => {
    if (hasMessages && currentConversationId) {
      const t = setTimeout(() => {
        messageInputRef.current?.focusInput?.()
      }, 100)
      return () => clearTimeout(t)
    }
  }, [hasMessages, currentConversationId])

  // Handle tool builder save
  const handleToolBuilderSave = useCallback((data: any) => {
    console.log('Tool builder data:', data)
    toast.success('Tool created successfully!', {
      description: `${data.name} has been created and is ready to use.`,
    })
    setViewMode('conversation')
    setIsMessageOverlayExpanded(false)
    wasOpenedByStreamingRef.current = false
    toolBuilderViewRef.current?.resetForm()
  }, [])

  // Handle tool builder cancel
  const handleToolBuilderCancel = useCallback(() => {
    setViewMode('conversation')
    setIsMessageOverlayExpanded(false)
    wasOpenedByStreamingRef.current = false
    toolBuilderViewRef.current?.resetForm()
  }, [])

  // Handle agent builder save
  const handleAgentBuilderSave = useCallback((data: any) => {
    console.log('Agent builder data:', data)
    toast.success('Agent created successfully!', {
      description: `${data.name} has been created and is ready to use.`,
    })
    setViewMode('conversation')
    setIsMessageOverlayExpanded(false)
    wasOpenedByStreamingRef.current = false
    agentBuilderViewRef.current?.resetForm()
  }, [])

  // Handle agent builder cancel
  const handleAgentBuilderCancel = useCallback(() => {
    setViewMode('conversation')
    setIsMessageOverlayExpanded(false)
    wasOpenedByStreamingRef.current = false
    agentBuilderViewRef.current?.resetForm()
  }, [])

  // Handle manual toggle of Tool Builder (persist and restore focused tool from conversation)
  const handleToggleToolBuilder = useCallback(() => {
    setViewMode(prev => {
      const next = prev === 'tool-builder' ? 'conversation' : 'tool-builder'
      if (next === 'tool-builder') {
        // Manual open: ensure streaming flag is off and rebuild state from conversation tool calls
        wasOpenedByStreamingRef.current = false
        // Reset the builder UI before replaying state
        toolBuilderViewRef.current?.resetForm()
        // Clear applied tool call dedupe so we can replay from conversation messages
        appliedToolCallKeysRef.current.clear()
        // Allow future UI payloads to be processed again if needed
        lastUIActionKeyRef.current = null
      }
      return next
    })
  }, [])

  // Handle manual toggle of Agent Builder
  const handleToggleAgentBuilder = useCallback(() => {
    setViewMode(prev => {
      const next = prev === 'agent-builder' ? 'conversation' : 'agent-builder'
      if (next === 'agent-builder') {
        // Manual open: ensure streaming flag is off and rebuild state from conversation tool calls
        wasOpenedByStreamingRef.current = false
        // Reset the builder UI before replaying state
        agentBuilderViewRef.current?.resetForm()
        // Clear applied tool call dedupe so we can replay from conversation messages
        appliedToolCallKeysRef.current.clear()
        // Allow future UI payloads to be processed again if needed
        lastUIActionKeyRef.current = null
      }
      return next
    })
  }, [])

  // Handle UI action payloads (dedup across SSE 'ui_action' and assistant message JSON)
  const handleUIPayload = useCallback(
    (payload: any) => {
      try {
        if (!payload || typeof payload !== 'object' || typeof (payload as any).__ui_action !== 'string') return
        const key = JSON.stringify(payload)
        if (lastUIActionKeyRef.current === key) return
        lastUIActionKeyRef.current = key

        const action = (payload as any).__ui_action as string

        const updateFieldWithGuard = (field: any, value: any) => {
          if (!toolBuilderViewRef.current) return
          if (field === 'blueprint') {
            const form = toolBuilderViewRef.current.getFormData?.()
            const currentStr = form?.blueprint || ''
            let currentBp: any = {}
            try {
              currentBp = JSON.parse(currentStr || '{}')
            } catch {}
            let incoming: any = value
            if (typeof incoming === 'string') {
              try {
                incoming = JSON.parse(incoming)
              } catch {}
            }
            const currentHas = (Array.isArray((currentBp as any).nodes) && (currentBp as any).nodes.length > 0) || (Array.isArray((currentBp as any).edges) && (currentBp as any).edges.length > 0)
            const incomingHas = incoming && ((Array.isArray(incoming.nodes) && incoming.nodes.length > 0) || (Array.isArray(incoming.edges) && incoming.edges.length > 0))
            if (!incomingHas && currentHas) {
              return
            }
            const bpStr = typeof value === 'string' ? value : JSON.stringify(incoming || {}, null, 2)
            toolBuilderViewRef.current.updateField('blueprint', bpStr)
            return
          }
          toolBuilderViewRef.current.updateField(field as any, value as any)
        }

        const ensureOpenThen = (fn: () => void) => {
          setTimeout(() => {
            const needReset = action === 'open_tool_form' && viewModeRef.current !== 'tool-builder'
            if (needReset) {
              toolBuilderViewRef.current?.resetForm()
            }
            // Mark that this transition was triggered by streaming
            wasOpenedByStreamingRef.current = true
            if (viewModeRef.current !== 'tool-builder') setViewMode('tool-builder')
            setTimeout(() => fn(), 150)
          }, 100)
        }

        switch (action) {
          case 'tool_call_detected': {
            const toolName = (payload as any).toolName
            const toolCallId = (payload as any).toolCallId

            console.log('🎯 Tool call detected:', { toolName, toolCallId })

            // Store tool call info for later completion handling
            if (toolCallId) {
              pendingToolCallsRef.current.set(toolCallId, { toolName, args: {} })
            }

            // Open tool builder for tool actions that affect tool data or blueprint
            const openToolBuilderSlugs = new Set([
              'tool-open',
              'tool-edit',
              'tool-add-blueprint-node',
              'tool-add-blueprint-edge',
              'tool-blueprint-edit-node',
              'tool-blueprint-remove-node',
              'tool-blueprint-edit-edge',
              'tool-blueprint-remove-edge',
            ])
            if (openToolBuilderSlugs.has(toolName) || toolName?.startsWith?.('tool-blueprint-')) {
              console.log('📂 Opening tool builder view for', toolName)
              // Only reset when transitioning into the builder; preserve existing form if already open
              if (viewModeRef.current !== 'tool-builder') {
                toolBuilderViewRef.current?.resetForm()
              }
              // Mark that this transition was triggered by streaming
              wasOpenedByStreamingRef.current = true
              if (viewModeRef.current !== 'tool-builder') setViewMode('tool-builder')
            }

            // Open agent builder for agent actions that affect agent data
            const openAgentBuilderSlugs = new Set(['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool'])
            if (openAgentBuilderSlugs.has(toolName)) {
              console.log('🌍 Opening agent builder view for', toolName)
              // Only reset when transitioning into the builder; preserve existing form if already open
              if (viewModeRef.current !== 'agent-builder') {
                agentBuilderViewRef.current?.resetForm()
              }
              // Mark that this transition was triggered by streaming
              wasOpenedByStreamingRef.current = true
              if (viewModeRef.current !== 'agent-builder') setViewMode('agent-builder')
            }
            break
          }

          case 'open_tool_form': {
            const form = (payload as any).formData || (payload as any).data || {}
            ensureOpenThen(() => {
              if (toolBuilderViewRef.current && form && typeof form === 'object') {
                Object.entries(form).forEach(([field, value]) => {
                  updateFieldWithGuard(field as any, value as any)
                })
              }
            })
            break
          }

          case 'update_tool_form': {
            const patch = (payload as any).patch || (payload as any).formData || (payload as any).data || {}
            if (viewMode !== 'tool-builder') {
              // Mark that this transition was triggered by streaming
              wasOpenedByStreamingRef.current = true
              ensureOpenThen(() => {
                if (toolBuilderViewRef.current && patch && typeof patch === 'object') {
                  Object.entries(patch).forEach(([field, value]) => {
                    updateFieldWithGuard(field as any, value as any)
                  })
                }
              })
            } else {
              if (patch && typeof patch === 'object') {
                Object.entries(patch).forEach(([field, value]) => {
                  updateFieldWithGuard(field as any, value as any)
                })
              }
            }
            break
          }

          case 'submit_tool_form': {
            const submit = () => {
              const formData = toolBuilderViewRef.current?.getFormData()
              if (formData) {
                handleToolBuilderSave(formData)
              }
            }
            if (viewMode !== 'tool-builder') {
              ensureOpenThen(submit)
            } else {
              submit()
            }
            break
          }

          case 'close_tool_form': {
            setViewMode('conversation')
            break
          }

          default:
            break
        }
      } catch {
        // ignore
      }
    },
    [handleToolBuilderSave]
  )

  // Handle tool completion for entity-modifying tools
  const handleToolComplete = useCallback(
    async (toolName: string, toolArgs: any) => {
      try {
        // Agent tools - fetch and sync agent data
        const agentTools = ['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool']
        if (agentTools.includes(toolName) && toolArgs?.slug && viewModeRef.current === 'agent-builder') {
          console.log('🔄 Fetching agent after tool completion:', toolArgs.slug)

          // Fetch complete agent data by slug
          const agent = await agentAPI.getBySlug(toolArgs.slug)

          if (agent && agentBuilderViewRef.current) {
            // Sync all fields with server data
            agentBuilderViewRef.current.updateField('name', agent.name)
            if (agent.description) agentBuilderViewRef.current.updateField('description', agent.description)
            if (agent.model) agentBuilderViewRef.current.updateField('model', agent.model)
            if (agent.systemPrompt) agentBuilderViewRef.current.updateField('systemPrompt', agent.systemPrompt)
            if (agent.temperature !== undefined) agentBuilderViewRef.current.updateField('temperature', agent.temperature)
            if (agent.maxTokens !== undefined) agentBuilderViewRef.current.updateField('maxTokens', agent.maxTokens)
            if (agent.timeout !== undefined) agentBuilderViewRef.current.updateField('timeout', agent.timeout)

            // Most important: sync the blueprint
            if (agent.blueprint) {
              agentBuilderViewRef.current.updateField('blueprint', JSON.stringify(agent.blueprint, null, 2))
            }

            console.log('✅ Agent form synced with server data')
          }
        }

        // Tool tools - fetch and sync tool data
        const toolTools = [
          'tool-open',
          'tool-edit',
          'tool-add-blueprint-node',
          'tool-add-blueprint-edge',
          'tool-blueprint-edit-node',
          'tool-blueprint-remove-node',
          'tool-blueprint-edit-edge',
          'tool-blueprint-remove-edge',
        ]
        if (toolTools.includes(toolName) && toolArgs?.slug && viewModeRef.current === 'tool-builder') {
          console.log('🔄 Fetching tool after tool completion:', toolArgs.slug)

          // Fetch complete tool data by slug
          const tool = await toolAPI.getBySlug(starshipId, toolArgs.slug)

          if (tool && toolBuilderViewRef.current) {
            // Sync all fields with server data
            toolBuilderViewRef.current.updateField('name', tool.name)
            if (tool.description) toolBuilderViewRef.current.updateField('description', tool.description)
            if (tool.parameters) toolBuilderViewRef.current.updateField('parameters', JSON.stringify(tool.parameters, null, 2))
            if (tool.blueprint) toolBuilderViewRef.current.updateField('blueprint', JSON.stringify(tool.blueprint, null, 2))

            console.log('✅ Tool form synced with server data')
          }
        }
      } catch (error) {
        console.error('Failed to fetch entity after tool completion:', error)
      }
    },
    [starshipId]
  )

  // Detect special UI action responses from assistant messages (back-compat path)
  useEffect(() => {
    if (!currentConversationId || !liveMessages.length) return

    const lastMessage = liveMessages[liveMessages.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage?.content) {
      try {
        const payload = typeof lastMessage.content === 'string' ? JSON.parse(lastMessage.content) : lastMessage.content
        handleUIPayload(payload)
      } catch {
        // Not JSON or doesn't have UI action, ignore
      }
    }
  }, [currentConversationId, liveMessages, handleUIPayload])

  // Detect tool completion from streaming messages
  useEffect(() => {
    if (!liveMessages || liveMessages.length === 0) return

    // Check last few messages for tool results
    const recentMessages = liveMessages.slice(-5)

    for (const msg of recentMessages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        const pendingCall = pendingToolCallsRef.current.get(msg.toolCallId)

        if (pendingCall && !pendingCall.completed) {
          // Mark as completed
          pendingCall.completed = true

          // Extract tool arguments from the conversation history
          // Look for assistant message with this toolCallId
          const assistantMsg = liveMessages.find(m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === msg.toolCallId))

          if (assistantMsg) {
            const toolCall = assistantMsg.toolCalls?.find(tc => tc.id === msg.toolCallId)
            if (toolCall?.function?.arguments) {
              pendingCall.args = toolCall.function.arguments

              // Trigger fetch after tool completes
              handleToolComplete(pendingCall.toolName, pendingCall.args)
            }
          }
        }
      }
    }
  }, [liveMessages, handleToolComplete])

  // Consume SSE 'ui_action' events directly (clean channel)
  useEffect(() => {
    if (!currentConversationId || !lastUIAction) return
    try {
      handleUIPayload(lastUIAction as any)
    } catch {
      // ignore
    }
  }, [currentConversationId, lastUIAction, handleUIPayload])

  // Auto-expand overlay when transitioning to builder views via streaming
  useEffect(() => {
    if ((viewMode === 'tool-builder' || viewMode === 'agent-builder') && wasOpenedByStreamingRef.current) {
      // Auto-expand the message overlay
      setIsMessageOverlayExpanded(true)
      // Reset the flag after a short delay
      const timer = setTimeout(() => {
        wasOpenedByStreamingRef.current = false
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [viewMode])

  // Handle click outside to collapse overlay
  useEffect(() => {
    if ((viewMode !== 'tool-builder' && viewMode !== 'agent-builder') || !isMessageOverlayExpanded) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const inputContainer = inputContainerRef.current

      // Check if click is outside the input container
      if (inputContainer && !inputContainer.contains(target)) {
        setIsMessageOverlayExpanded(false)
      }
    }

    // Add listener after a small delay to avoid immediate collapse on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [viewMode, isMessageOverlayExpanded])

  // Stream tool arguments into builder as they arrive (compose all mutations before writing)
  useEffect(() => {
    if (!currentConversationId || !liveMessages.length || viewMode !== 'tool-builder') return

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

    const form = toolBuilderViewRef.current?.getFormData?.()
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
      const msg = liveMessages[mi]
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
    if (compose.name !== undefined) toolBuilderViewRef.current?.updateField('name', compose.name)
    if (compose.description !== undefined) toolBuilderViewRef.current?.updateField('description', compose.description)
    if (compose.category !== undefined) toolBuilderViewRef.current?.updateField('category', compose.category)
    if (compose.exampleUsage !== undefined) toolBuilderViewRef.current?.updateField('exampleUsage', compose.exampleUsage)
    if (compose.requiresApiKey !== undefined) toolBuilderViewRef.current?.updateField('requiresApiKey', compose.requiresApiKey)
    if (compose.parameters !== undefined) toolBuilderViewRef.current?.updateField('parameters', compose.parameters)
    if (compose.blueprintChanged) {
      const bpStr = JSON.stringify(bp, null, 2)
      toolBuilderViewRef.current?.updateField('blueprint', bpStr)
    }
  }, [currentConversationId, liveMessages, viewMode])

  // Stream agent arguments into builder as they arrive
  useEffect(() => {
    if (!currentConversationId || !liveMessages.length || viewMode !== 'agent-builder') return

    // Eligible tool slugs that should drive the Agent Builder
    const builderToolSlugs = new Set(['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool'])

    const form = agentBuilderViewRef.current?.getFormData?.()
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
      const msg = liveMessages[mi]
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
    if (compose.name !== undefined) agentBuilderViewRef.current?.updateField('name', compose.name)
    if (compose.slug !== undefined) agentBuilderViewRef.current?.updateField('slug', compose.slug)
    if (compose.description !== undefined) agentBuilderViewRef.current?.updateField('description', compose.description)
    if (compose.category !== undefined) agentBuilderViewRef.current?.updateField('category', compose.category)
    if (compose.model !== undefined) agentBuilderViewRef.current?.updateField('model', compose.model)
    if (compose.temperature !== undefined) agentBuilderViewRef.current?.updateField('temperature', compose.temperature)
    if (compose.maxTokens !== undefined) agentBuilderViewRef.current?.updateField('maxTokens', compose.maxTokens)
    if (compose.systemPrompt !== undefined) agentBuilderViewRef.current?.updateField('systemPrompt', compose.systemPrompt)
    if (compose.icon !== undefined) agentBuilderViewRef.current?.updateField('icon', compose.icon)
    if (compose.timeout !== undefined) agentBuilderViewRef.current?.updateField('timeout', compose.timeout)
    if (compose.assignedToolSlugs !== undefined) agentBuilderViewRef.current?.updateField('assignedToolSlugs', compose.assignedToolSlugs)
    if (compose.blueprintChanged) {
      const bpStr = JSON.stringify(bp, null, 2)
      agentBuilderViewRef.current?.updateField('blueprint', bpStr)
    }
  }, [currentConversationId, liveMessages, viewMode])

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <div className="text-center space-y-4 opacity-100">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground">Initializing conversation...</p>
        </div>
      </div>
    )
  }

  // Show auth required state
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <div className="text-center space-y-4 opacity-100">
          <div className="w-16 h-16 mx-auto bg-muted/20 rounded-full flex items-center justify-center">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Please sign in to start a conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative flex flex-col h-screen transition-all duration-500 ease-in-out"
      style={{
        marginLeft: '5.5rem', // Consistent offset for both modes to prevent content shift
        overflow: viewMode === 'tool-builder' || viewMode === 'agent-builder' ? 'visible' : 'hidden',
      }}
    >
      {/* Content container */}
      <div className="relative z-[2] flex flex-col h-full">
        {/* Main Content Area - Switches between Conversation, Tool Builder, and Agent Builder */}
        {viewMode === 'tool-builder' ? (
          <ToolBuilderView ref={toolBuilderViewRef} onSave={handleToolBuilderSave} onCancel={handleToolBuilderCancel} starshipId={starshipId} />
        ) : viewMode === 'agent-builder' ? (
          <AgentBuilderView ref={agentBuilderViewRef} onSave={handleAgentBuilderSave} onCancel={handleAgentBuilderCancel} starshipId={starshipId} />
        ) : (
          <>
            {/* Messages Area or Welcome Screen */}
            {showMessagesArea ? (
              <>
                <ConversationContextBar conversationId={currentConversationId} {...(budgetTokens !== undefined && { budgetTokens })} />
                <div className="flex-1 min-h-0">
                  <ConversationMessageList conversationId={currentConversationId} starshipId={starshipId} bottomPaddingPx={inputHeight + 24} />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32">
                {/* Welcome Section */}
                <div className="text-center mb-8 max-w-2xl opacity-100">
                  <h1 className="text-5xl font-light mb-4 bg-gradient-to-b from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">Let&apos;s Build</h1>
                  <p className="text-muted-foreground text-lg font-light">Choose an AI agent below to start collaborating on your project</p>
                </div>

                {/* Spacer for floating input */}
                <div className="h-32 mb-8"></div>

                {/* Suggestions */}
                <div className="space-y-3 max-w-2xl w-full opacity-100">
                  {AGENT_SUGGESTIONS.map((suggestion, index) => (
                    <button
                      key={suggestion}
                      className="w-full text-left flex items-center gap-3 p-4 text-sm text-foreground/90 bg-muted/20 hover:bg-muted/30 rounded-xl border border-border/20 transition-all duration-200 backdrop-blur-sm group opacity-100"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Sparkles className="w-3 h-3 text-primary/70 group-hover:text-primary transition-colors" />
                      </div>
                      <span className="flex-1">{suggestion}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Floating Input Container - Always visible, position changes based on state */}
        <div
          ref={inputContainerRef}
          className="absolute left-0 right-0 p-6 pointer-events-none transition-all duration-300 ease-in-out z-30"
          style={{
            bottom: viewMode === 'tool-builder' || viewMode === 'agent-builder' || showMessagesArea ? '0px' : 'calc(50% + 2rem)',
          }}
        >
          <div className="max-w-2xl mx-auto pointer-events-auto opacity-100" data-message-input>
            <ConversationMessageInput
              ref={messageInputRef}
              selectedAgent={selectedAgent}
              starshipId={starshipId}
              conversationId={currentConversationId}
              onConversationStart={handleConversationStart}
              onToggleToolForm={handleToggleToolBuilder}
              isToolFormOpen={viewMode === 'tool-builder' || viewMode === 'agent-builder'}
              disabled={!selectedAgent}
              minimal={viewMode === 'tool-builder' || viewMode === 'agent-builder' || showMessagesArea}
              onFocus={() => (viewMode === 'tool-builder' || viewMode === 'agent-builder') && !uiStreaming && setIsMessageOverlayExpanded(true)}
              onBlur={() => setIsMessageOverlayExpanded(false)}
              onToggleOverlay={handleToggleOverlay}
              showExpandableOverlay={viewMode === 'tool-builder' || viewMode === 'agent-builder'}
              isOverlayExpanded={isMessageOverlayExpanded}
              budgetTokens={budgetTokens}
            >
              {/* Footer Content - Agent Selector */}
              <AgentSelector selectedAgent={selectedAgent} onAgentChange={handleAgentChange} starshipId={starshipId} compact={true} />
            </ConversationMessageInput>
          </div>
        </div>
      </div>
    </div>
  )
}

// Suggestion examples
const AGENT_SUGGESTIONS = ['Help me plan a project timeline with milestones', 'Analyze this data set and find patterns', 'Write code for a responsive navigation component']
