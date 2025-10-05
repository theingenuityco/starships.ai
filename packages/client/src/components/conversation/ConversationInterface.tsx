'use client'

import { AgentSelector } from '@/components/conversation/AgentSelector'
import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ToolFormView, ToolFormViewRef } from '@/components/conversation/ToolFormView'
import { ExpandableMessageOverlay } from '@/components/conversation/ExpandableMessageOverlay'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useConversationStreamed } from '@/hooks/useConversations'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import type { Agent } from '@/lib/api'
import { Sparkles, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationContextBar } from '@/components/conversation/ConversationContextBar'
import { useModelContextLength } from '@/hooks/useOpenRouterModels'
import { toast } from 'sonner'

interface ConversationInterfaceProps {
  starshipId: string
  conversationId?: string | null
  onConversationChange?: (conversationId: string | null) => void
}

export function ConversationInterface({ starshipId, conversationId: externalConversationId, onConversationChange }: ConversationInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()

  // Agent and UI state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const { contextLength: agentContextLength } = useModelContextLength(selectedAgent?.model)
  const budgetTokens = agentContextLength

  // UI state (conversation id only; message presence is derived from store)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)

  // Refs for direct communication with components
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const toolFormViewRef = useRef<ToolFormViewRef>(null)
  const lastUIActionKeyRef = useRef<string | null>(null)

  // View mode state: 'conversation' or 'tool-form'
  const [viewMode, setViewMode] = useState<'conversation' | 'tool-form'>('conversation')

  // Expanded overlay state for message history when in tool-form mode
  const [isMessageOverlayExpanded, setIsMessageOverlayExpanded] = useState(false)

  // Track streaming state for current conversation to focus input on completion
  const { isStreaming: uiStreaming, messages: liveMessages = [], lastUIAction } = useConversationStreamed(currentConversationId)
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

  // Reset conversation when external conversation ID changes
  useEffect(() => {
    if (externalConversationId === undefined) return
    setCurrentConversationId(prev => (prev === externalConversationId ? prev : externalConversationId))
  }, [externalConversationId])

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

  // Handle tool form save
  const handleToolFormSave = useCallback((data: any) => {
    console.log('Tool form data:', data)
    toast.success('Tool created successfully!', {
      description: `${data.name} has been created and is ready to use.`,
    })
    setViewMode('conversation')
    toolFormViewRef.current?.resetForm()
  }, [])

  // Handle tool form cancel
  const handleToolFormCancel = useCallback(() => {
    setViewMode('conversation')
    toolFormViewRef.current?.resetForm()
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

        const ensureOpenThen = (fn: () => void) => {
          setTimeout(() => {
            if (action === 'open_tool_form') {
              toolFormViewRef.current?.resetForm()
            }
            setViewMode('tool-form')
            setTimeout(() => fn(), 150)
          }, 100)
        }

        switch (action) {
          case 'tool_call_detected': {
            const toolName = (payload as any).toolName
            const toolCallId = (payload as any).toolCallId

            console.log('🎯 Tool call detected:', { toolName, toolCallId })

            // Open form for tool_create
            if (toolName === 'tool_create') {
              console.log('📂 Opening tool form view for tool_create')
              toolFormViewRef.current?.resetForm()
              setViewMode('tool-form')
            }
            break
          }

          case 'open_tool_form': {
            const form = (payload as any).formData || (payload as any).data || {}
            ensureOpenThen(() => {
              if (toolFormViewRef.current && form && typeof form === 'object') {
                Object.entries(form).forEach(([field, value]) => {
                  toolFormViewRef.current?.updateField(field as any, value as any)
                })
              }
            })
            break
          }

          case 'update_tool_form': {
            const patch = (payload as any).patch || (payload as any).formData || (payload as any).data || {}
            if (viewMode !== 'tool-form') {
              ensureOpenThen(() => {
                if (toolFormViewRef.current && patch && typeof patch === 'object') {
                  Object.entries(patch).forEach(([field, value]) => {
                    toolFormViewRef.current?.updateField(field as any, value as any)
                  })
                }
              })
            } else {
              if (patch && typeof patch === 'object') {
                Object.entries(patch).forEach(([field, value]) => {
                  toolFormViewRef.current?.updateField(field as any, value as any)
                })
              }
            }
            break
          }

          case 'submit_tool_form': {
            const submit = () => {
              const formData = toolFormViewRef.current?.getFormData()
              if (formData) {
                handleToolFormSave(formData)
              }
            }
            if (viewMode !== 'tool-form') {
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
    [handleToolFormSave]
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

  // Consume SSE 'ui_action' events directly (clean channel)
  useEffect(() => {
    if (!currentConversationId || !lastUIAction) return
    try {
      handleUIPayload(lastUIAction as any)
    } catch {
      // ignore
    }
  }, [currentConversationId, lastUIAction, handleUIPayload])

  // Stream tool arguments into form as they arrive
  useEffect(() => {
    if (!currentConversationId || !liveMessages.length || viewMode !== 'tool-form') return

    // Find the last assistant message with toolCalls (reverse iteration)
    // Look for both streaming and completed messages to handle cases where
    // the view opens after streaming has finished
    let lastAssistant: any = null
    for (let i = liveMessages.length - 1; i >= 0; i--) {
      const m = liveMessages[i]
      if (m.role === 'assistant' && (m as any).toolCalls && Array.isArray((m as any).toolCalls)) {
        lastAssistant = m
        break
      }
    }

    if (!lastAssistant || !(lastAssistant as any).toolCalls) return

    const toolCalls = (lastAssistant as any).toolCalls || []
    const toolCreateCall = toolCalls.find((tc: any) => tc?.function?.name === 'tool_create')

    if (toolCreateCall && toolCreateCall.function?.arguments) {
      const args: any = toolCreateCall.function.arguments

      // Only try to populate if arguments actually exist
      if (!args || (typeof args === 'object' && Object.keys(args).length === 0)) {
        return // Arguments not yet available
      }

      // Update form fields as they become available
      if (args.name && toolFormViewRef.current) {
        toolFormViewRef.current.updateField('name', args.name)
      }
      if (args.description && toolFormViewRef.current) {
        toolFormViewRef.current.updateField('description', args.description)
      }
      if (args.category && toolFormViewRef.current) {
        toolFormViewRef.current.updateField('category', args.category)
      }
      if (args.exampleUsage && toolFormViewRef.current) {
        toolFormViewRef.current.updateField('exampleUsage', args.exampleUsage)
      }
      if (args.requiresApiKey !== undefined && toolFormViewRef.current) {
        toolFormViewRef.current.updateField('requiresApiKey', args.requiresApiKey)
      }
      if (args.parameters && toolFormViewRef.current) {
        const paramsStr = typeof args.parameters === 'string' ? args.parameters : JSON.stringify(args.parameters, null, 2)
        toolFormViewRef.current.updateField('parameters', paramsStr)
      }
      if (args.blueprint && toolFormViewRef.current) {
        const blueprintStr = typeof args.blueprint === 'string' ? args.blueprint : JSON.stringify(args.blueprint, null, 2)
        toolFormViewRef.current.updateField('blueprint', blueprintStr)
      }
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
      className="relative flex flex-col h-screen transition-all duration-500 ease-in-out overflow-hidden"
      style={{
        marginLeft: '5.5rem', // Account for fixed navigation (left-6 + w-16 = 1.5rem + 4rem)
      }}
    >
      {/* Content container */}
      <div className="relative z-[2] flex flex-col h-full">
        {/* Main Content Area - Switches between Conversation and Tool Form */}
        {viewMode === 'tool-form' ? (
          <ToolFormView ref={toolFormViewRef} onSave={handleToolFormSave} onCancel={handleToolFormCancel} starshipId={starshipId} />
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

        {/* Floating Input - Always visible, position changes based on state */}
        <div
          ref={inputContainerRef}
          className="absolute left-0 right-0 p-6 pointer-events-none transition-all duration-300 ease-in-out z-30"
          style={{
            bottom: viewMode === 'tool-form' || showMessagesArea ? '0px' : 'calc(50% + 2rem)',
          }}
        >
          <div className="max-w-2xl mx-auto pointer-events-auto opacity-100" data-message-input>
            <ConversationMessageInput
              ref={messageInputRef}
              selectedAgent={selectedAgent}
              starshipId={starshipId}
              conversationId={currentConversationId}
              onConversationStart={handleConversationStart}
              onToggleToolForm={() => setViewMode(prev => (prev === 'tool-form' ? 'conversation' : 'tool-form'))}
              isToolFormOpen={viewMode === 'tool-form'}
              disabled={!selectedAgent}
              minimal={viewMode === 'tool-form' || showMessagesArea}
              onFocus={() => viewMode === 'tool-form' && setIsMessageOverlayExpanded(true)}
              onBlur={() => setIsMessageOverlayExpanded(false)}
            >
              {/* Footer Content - Agent Selector */}
              <AgentSelector selectedAgent={selectedAgent} onAgentChange={handleAgentChange} starshipId={starshipId} compact={true} />
            </ConversationMessageInput>
          </div>
        </div>

        {/* Expandable Message Overlay - Shows conversation history when in tool-form mode */}
        {viewMode === 'tool-form' && currentConversationId && (
          <ExpandableMessageOverlay
            isExpanded={isMessageOverlayExpanded}
            onCollapse={() => setIsMessageOverlayExpanded(false)}
            conversationId={currentConversationId}
            starshipId={starshipId}
            budgetTokens={budgetTokens}
            inputHeight={inputHeight}
          />
        )}
      </div>
    </div>
  )
}

// Suggestion examples
const AGENT_SUGGESTIONS = ['Help me plan a project timeline with milestones', 'Analyze this data set and find patterns', 'Write code for a responsive navigation component']
