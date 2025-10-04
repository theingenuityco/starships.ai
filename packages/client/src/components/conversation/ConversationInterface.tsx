'use client'

import { AgentSelector } from '@/components/conversation/AgentSelector'
import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ToolFormDrawer, ToolFormDrawerRef } from '@/components/conversation/ToolFormDrawer'
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
import { registerToolFormController, unregisterToolFormController } from '@/lib/tool-form-controller'

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
  const toolFormDrawerRef = useRef<ToolFormDrawerRef>(null)
  const lastUIActionKeyRef = useRef<string | null>(null)

  // Tool form drawer state
  const [toolFormDrawerOpen, setToolFormDrawerOpen] = useState(false)

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
    setToolFormDrawerOpen(false)
    toolFormDrawerRef.current?.resetForm()
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
              toolFormDrawerRef.current?.resetForm()
            }
            setToolFormDrawerOpen(true)
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
              console.log('📂 Opening tool form drawer for tool_create')
              toolFormDrawerRef.current?.resetForm()
              setToolFormDrawerOpen(true)
            }
            break
          }

          case 'open_tool_form': {
            const form = (payload as any).formData || (payload as any).data || {}
            ensureOpenThen(() => {
              if (toolFormDrawerRef.current && form && typeof form === 'object') {
                Object.entries(form).forEach(([field, value]) => {
                  toolFormDrawerRef.current?.updateField(field as any, value as any)
                })
              }
            })
            break
          }

          case 'update_tool_form': {
            const patch = (payload as any).patch || (payload as any).formData || (payload as any).data || {}
            if (!toolFormDrawerRef.current) {
              ensureOpenThen(() => {
                if (toolFormDrawerRef.current && patch && typeof patch === 'object') {
                  Object.entries(patch).forEach(([field, value]) => {
                    toolFormDrawerRef.current?.updateField(field as any, value as any)
                  })
                }
              })
            } else {
              if (patch && typeof patch === 'object') {
                Object.entries(patch).forEach(([field, value]) => {
                  toolFormDrawerRef.current?.updateField(field as any, value as any)
                })
              }
            }
            break
          }

          case 'submit_tool_form': {
            const submit = () => {
              const formData = toolFormDrawerRef.current?.getFormData()
              if (formData) {
                handleToolFormSave(formData)
              }
            }
            if (!toolFormDrawerRef.current) {
              ensureOpenThen(submit)
            } else {
              submit()
            }
            break
          }

          case 'close_tool_form': {
            setToolFormDrawerOpen(false)
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
    if (!currentConversationId || !liveMessages.length || !toolFormDrawerOpen) return

    // Find the last assistant message with toolCalls (reverse iteration)
    // Look for both streaming and completed messages to handle cases where
    // the drawer opens after streaming has finished
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
      if (args.name && toolFormDrawerRef.current) {
        toolFormDrawerRef.current.updateField('name', args.name)
      }
      if (args.description && toolFormDrawerRef.current) {
        toolFormDrawerRef.current.updateField('description', args.description)
      }
      if (args.category && toolFormDrawerRef.current) {
        toolFormDrawerRef.current.updateField('category', args.category)
      }
      if (args.exampleUsage && toolFormDrawerRef.current) {
        toolFormDrawerRef.current.updateField('exampleUsage', args.exampleUsage)
      }
      if (args.requiresApiKey !== undefined && toolFormDrawerRef.current) {
        toolFormDrawerRef.current.updateField('requiresApiKey', args.requiresApiKey)
      }
      if (args.parameters && toolFormDrawerRef.current) {
        const paramsStr = typeof args.parameters === 'string' ? args.parameters : JSON.stringify(args.parameters, null, 2)
        toolFormDrawerRef.current.updateField('parameters', paramsStr)
      }
      if (args.blueprint && toolFormDrawerRef.current) {
        const blueprintStr = typeof args.blueprint === 'string' ? args.blueprint : JSON.stringify(args.blueprint, null, 2)
        toolFormDrawerRef.current.updateField('blueprint', blueprintStr)
      }
    }
  }, [currentConversationId, liveMessages, toolFormDrawerOpen])

  // Register tool form controller for programmatic access
  useEffect(() => {
    const controller = {
      openDrawer: () => setToolFormDrawerOpen(true),
      closeDrawer: () => setToolFormDrawerOpen(false),
      updateField: (field: string, value: string | boolean) => {
        toolFormDrawerRef.current?.updateField(field as any, value)
      },
      getFormData: () => toolFormDrawerRef.current?.getFormData() ?? null,
      resetForm: () => toolFormDrawerRef.current?.resetForm(),
      submitForm: () => {
        const formData = toolFormDrawerRef.current?.getFormData()
        if (formData) {
          handleToolFormSave(formData)
        }
      },
      setFormData: (data: any) => {
        Object.entries(data).forEach(([field, value]) => {
          if (value !== undefined && (typeof value === 'string' || typeof value === 'boolean')) {
            toolFormDrawerRef.current?.updateField(field as any, value)
          }
        })
      },
    }

    registerToolFormController(controller)

    return () => {
      unregisterToolFormController()
    }
  }, [handleToolFormSave])

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
      className="relative flex flex-col h-screen bg-background transition-all duration-300 ease-in-out"
      style={{
        marginLeft: '5.5rem', // Account for fixed navigation (left-6 + w-16 = 1.5rem + 4rem)
        marginRight: toolFormDrawerOpen ? 'calc(min(42rem, 100vw - 3rem) + 1.5rem)' : '0',
      }}
    >
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
            <h1 className="text-5xl font-light mb-4 bg-gradient-to-b from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">Meet Your AI Agents</h1>
            <p className="text-muted-foreground text-lg font-light">Connect with specialized agents for focused assistance</p>
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

      {/* Floating Input - Position changes based on state */}
      <div
        ref={inputContainerRef}
        className="absolute left-0 right-0 p-6 pointer-events-none transition-all duration-300 ease-in-out"
        style={{
          bottom: showMessagesArea ? '0px' : 'calc(50% + 2rem)',
        }}
      >
        <div className="max-w-2xl mx-auto pointer-events-auto opacity-100">
          <ConversationMessageInput
            ref={messageInputRef}
            selectedAgent={selectedAgent}
            starshipId={starshipId}
            conversationId={currentConversationId}
            onConversationStart={handleConversationStart}
            onOpenToolForm={() => setToolFormDrawerOpen(true)}
            disabled={!selectedAgent}
            minimal={showMessagesArea}
          >
            {/* Footer Content - Agent Selector */}
            <AgentSelector selectedAgent={selectedAgent} onAgentChange={handleAgentChange} starshipId={starshipId} compact={true} />
          </ConversationMessageInput>
        </div>
      </div>

      {/* Tool Form Drawer */}
      <ToolFormDrawer ref={toolFormDrawerRef} open={toolFormDrawerOpen} onOpenChange={setToolFormDrawerOpen} onSave={handleToolFormSave} starshipId={starshipId} />
    </div>
  )
}

// Suggestion examples
const AGENT_SUGGESTIONS = ['Help me plan a project timeline with milestones', 'Analyze this data set and find patterns', 'Write code for a responsive navigation component']
