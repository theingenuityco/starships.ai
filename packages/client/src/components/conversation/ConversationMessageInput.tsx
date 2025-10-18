'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useCreateConversation, useConversationStreamed } from '@/hooks/useConversations'
import { useConversationUsageTotals } from '@/hooks/useUsage'
import { useModelContextLength } from '@/hooks/useOpenRouterModels'
import { useWallet } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import type { AgentModel } from '@starships/protocol'

import { forwardRef, KeyboardEvent, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import { createRoot } from 'react-dom/client'
// Removed tippy.js; using our own anchored container with fixed positioning
// Using native textarea again; react-mentions kept internal mention state we no longer use
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
// Tooltip no longer needed after removing tool builder button
import { ExpandableMessageOverlay } from './ExpandableMessageOverlay'
import TopupButton from '@/components/billing/TopupButton'
import { toast } from 'sonner'
import { useStarshipAgents } from '@/hooks/useAgents'

interface ConversationMessageInputProps {
  selectedAgent?: AgentModel | null
  starshipId: string
  conversationId?: string | null
  onConversationStart?: (conversationId: string) => void
  onMessageSent?: () => void // Simplified callback for UI state updates
  onToggleToolForm?: () => void // Callback to toggle tool form drawer
  isToolFormOpen?: boolean // Current state of tool form drawer
  disabled?: boolean
  minimal?: boolean
  children?: React.ReactNode // For footer content
  onFocus?: () => void // Callback when input is focused
  onBlur?: () => void // Callback when input loses focus
  onToggleOverlay?: () => void // Callback to toggle overlay expansion (used when input is disabled)
  // Props for expandable overlay (when in tool-form mode)
  showExpandableOverlay?: boolean
  isOverlayExpanded?: boolean
  budgetTokens?: number
  onAgentChange?: (agent: AgentModel | null) => void
}

export interface ConversationMessageInputRef {
  handleSuggestionSubmit: (suggestion: string) => Promise<void>
  focusInput: () => void
}

export const ConversationMessageInput = forwardRef<ConversationMessageInputRef, ConversationMessageInputProps>(
  (
    {
      selectedAgent,
      starshipId,
      conversationId,
      onConversationStart,
      onMessageSent,
      // onToggleToolForm,
      // isToolFormOpen = false,
      disabled = false,
      minimal = false,
      children,
      onFocus,
      onBlur,
      onToggleOverlay,
      showExpandableOverlay = false,
      isOverlayExpanded = false,
      budgetTokens,
      onAgentChange,
    },
    ref
  ) => {
    const { userId } = useAuth()
    const [message, setMessage] = useState('')
    const [sending, setSending] = useState(false)
    const [isRecording, setIsRecording] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const createConversation = useCreateConversation()
    const { data: wallet } = useWallet(starshipId, !!starshipId)
    const MINIMUM_THRESHOLD = 0.05
    const hasFunds = Number(wallet?.balance ?? '0') >= MINIMUM_THRESHOLD

    // Load agents for @mention parsing
    const { data: starshipAgents = [] } = useStarshipAgents(starshipId, !!starshipId)
    const agentsRef = useRef<AgentModel[]>([])
    useEffect(() => {
      agentsRef.current = (starshipAgents as AgentModel[]) || []
    }, [starshipAgents])

    // Use streamedQuery-based conversation hook
    const { sendMessage: sendMessageFn, isSending, isResponding } = useConversationStreamed(conversationId ?? null, starshipId)
    const isStreamingEffective = isResponding

    // Usage and context control
    const { data: totalsData } = useConversationUsageTotals(conversationId ?? null)
    const { contextLength: agentContextLength } = useModelContextLength(selectedAgent?.model || null)
    const tokensUsed = Number(totalsData?.totalTokens ?? 0)
    const contextLimit = Number(agentContextLength ?? 0)
    const hardLimitActive = !!conversationId && contextLimit > 0
    // Track previous streaming state to detect transition to complete and refocus input
    const prevIsStreamingRef = useRef(isStreamingEffective)

    // Mention UI state (custom dropdown styled like AgentSelector)
    const [isMentionOpen, setIsMentionOpen] = useState(false)
    const [mentionQuery, setMentionQuery] = useState('')
    const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null)
    const [mentionActiveIndex, setMentionActiveIndex] = useState(0)

    // Consolidated focus management - handles all focus scenarios
    useEffect(() => {
      const shouldFocus = () => {
        // Don't focus if disabled, streaming, or sending
        if (disabled || isStreamingEffective || sending) return false

        // Always focus on component mount or navigation changes
        return true
      }

      // Handle streaming completion focus
      const wasStreaming = prevIsStreamingRef.current
      const streamingCompleted = wasStreaming && !isStreamingEffective

      if (textareaRef.current && shouldFocus()) {
        const delay = streamingCompleted ? 50 : 100 // Faster focus after streaming completes
        const timer = setTimeout(() => {
          textareaRef.current?.focus()
        }, delay)

        // Update streaming ref
        prevIsStreamingRef.current = isStreamingEffective

        return () => clearTimeout(timer)
      }

      // Always update the streaming ref
      prevIsStreamingRef.current = isStreamingEffective
    }, [disabled, isStreamingEffective, sending, selectedAgent, conversationId])

    // Sync local 'sending' with streaming completion to avoid stuck disabled/loading state
    useEffect(() => {
      if (!isStreamingEffective && sending) {
        setSending(false)
      }
    }, [isStreamingEffective, sending])

    const handleSubmit = useCallback(async () => {
      const messageToSend = message.trim()
      if (!messageToSend || sending || disabled) return

      // Support leading @agent mention to switch/select agent
      let effectiveAgent: AgentModel | null | undefined = selectedAgent
      let contentToSend = messageToSend
      const mentionMatch = messageToSend.match(/^\s*@([A-Za-z0-9_-]+)/)
      if (mentionMatch && starshipAgents.length > 0) {
        const handle = mentionMatch[1]
        const lower = handle.toLowerCase()
        const matched = starshipAgents.find(a => a.slug.toLowerCase() === lower || a.name.toLowerCase() === lower)
        if (matched) {
          effectiveAgent = matched
          // Remove the leading mention token from the message text
          contentToSend = messageToSend.replace(mentionMatch[0], '').trimStart()
          if (onAgentChange) onAgentChange(matched)
        }
      }

      // Validation for agent and starship
      if (!effectiveAgent) {
        toast.error('Select an agent', { description: 'Please select an agent to chat.' })
        return
      }

      // If message becomes empty after removing mention, do not send
      if (!contentToSend) {
        setMessage('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
        return
      }

      if (!starshipId) {
        toast.error('No starship selected', { description: 'Please select a ship before chatting.' })
        return
      }

      if (!userId) {
        toast.error('Authentication required', { description: 'Please sign in to continue.' })
        return
      }

      try {
        setSending(true)
        // Create conversation if one doesn't exist
        let currentConversationId = conversationId
        if (!currentConversationId) {
          const newConversation = await createConversation.mutateAsync({
            title: `Chat with ${effectiveAgent.name}`,
            starshipId: starshipId,
            agentId: effectiveAgent.id,
          })
          currentConversationId = newConversation.id
          onConversationStart?.(currentConversationId!)
        }

        // Set agent information in store
        const { setConversationAgent } = useStarshipUIStore.getState()
        setConversationAgent(currentConversationId!, effectiveAgent.id, effectiveAgent.name)

        // Clear input and reset UI immediately for better UX
        setMessage('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }

        /* optimistic append skipped (server-SSE will add user message) */

        // Streaming UI is driven by TanStack Query status

        // Notify parent about message activity immediately (for UI state updates)
        onMessageSent?.()

        // Fire-and-forget streaming; streaming lifecycle manages completion/cleanup
        void sendMessageFn({
          conversationId: currentConversationId!,
          agentId: effectiveAgent!.id,
          content: contentToSend,
          role: 'user',
          starshipId: starshipId!,
          messageType: 'user_input',
        })
          .catch(error => {
            toast.error('Failed to send message', { description: (error as any)?.message || 'Please try again.' })
            // Restore message on error
            setMessage(messageToSend)
          })
          .finally(() => {
            setSending(false)
          })

        // Exit early to avoid hitting catch/finally paths
        return
      } catch (error) {
        toast.error('Failed to send message', { description: (error as any)?.message || 'Please try again.' })
        // Restore message and ensure local sending cleared on immediate failure
        setMessage(messageToSend)
        setSending(false)
      }
    }, [message, sending, disabled, selectedAgent, userId, conversationId, createConversation, onConversationStart, onMessageSent, sendMessageFn, starshipId, onAgentChange, starshipAgents])

    // Handle suggestion clicks
    const handleSuggestionSubmit = useCallback(
      async (suggestionText: string) => {
        if (!suggestionText || sending || disabled) return

        // Validation for agent and starship
        if (!selectedAgent) {
          toast.error('Select an agent', { description: 'Please select an agent to chat.' })
          return
        }

        if (!starshipId) {
          toast.error('No starship selected', { description: 'Please select a ship before chatting.' })
          return
        }

        if (!userId) {
          toast.error('Authentication required', { description: 'Please sign in to continue.' })
          return
        }

        try {
          setSending(true)
          // Create conversation if one doesn't exist
          let currentConversationId = conversationId
          if (!currentConversationId) {
            const newConversation = await createConversation.mutateAsync({
              title: `Chat with ${selectedAgent.name}`,
              starshipId: starshipId,
              agentId: selectedAgent.id,
            })
            currentConversationId = newConversation.id
            onConversationStart?.(currentConversationId!)
          }

          // Set agent information in store
          const { setConversationAgent } = useStarshipUIStore.getState()
          setConversationAgent(currentConversationId!, selectedAgent.id, selectedAgent.name)

          /* optimistic append skipped (server-SSE will add user message) */

          // Streaming UI is driven by TanStack Query status

          // Notify parent about message activity immediately (for UI state updates)
          onMessageSent?.()

          // Fire-and-forget streaming; streaming lifecycle manages completion/cleanup
          void sendMessageFn({
            conversationId: currentConversationId!,
            agentId: selectedAgent!.id,
            content: suggestionText,
            role: 'user',
            starshipId: starshipId!,
            messageType: 'user_input',
          })
            .catch(error => {
              toast.error('Failed to send suggestion', { description: (error as any)?.message || 'Please try again.' })
            })
            .finally(() => {
              setSending(false)
            })

          return
        } catch (error) {
          toast.error('Failed to send suggestion', { description: (error as any)?.message || 'Please try again.' })
          setSending(false)
        }
      },
      [sending, disabled, selectedAgent, userId, conversationId, createConversation, onConversationStart, onMessageSent, sendMessageFn, starshipId]
    )

    const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (isMentionOpen) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isMentionOpen) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionActiveIndex(prev => (prev + 1) % Math.max(uiMentionOptions.length || 1, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionActiveIndex(prev => (prev - 1 + Math.max(uiMentionOptions.length || 1, 1)) % Math.max(uiMentionOptions.length || 1, 1))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const choice = uiMentionOptions[mentionActiveIndex]
        if (choice) applyMentionChoice(choice)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsMentionOpen(false)
      }
    }

    const handleMentionsChange = (e: any, newValue: string) => {
      setMessage(newValue)

      // Auto-resize underlying textarea via ref (event may be null in react-mentions)
      const textarea = textareaRef.current
      if (textarea) {
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.min(textarea.scrollHeight, minimal ? 80 : 120)}px`
      }

      // Mention detection near caret
      try {
        const caret = (textarea as HTMLTextAreaElement | null)?.selectionStart ?? newValue.length
        const before = newValue.slice(0, caret)
        const match = before.match(/(^|\s)@([A-Za-z0-9_-]*)$/)
        if (match) {
          const query = match[2] ?? ''
          setMentionQuery(query)
          setMentionStartIndex(caret - (query.length + 1))
          setIsMentionOpen(true)
          setMentionActiveIndex(0)
        } else {
          setIsMentionOpen(false)
          setMentionQuery('')
          setMentionStartIndex(null)
        }
      } catch {
        // ignore caret errors
      }
    }

    const handleVoiceToggle = () => {
      setIsRecording(!isRecording)
      // TODO: Implement voice recording
    }

    const getPlaceholder = () => {
      if (isStreamingEffective) return selectedAgent ? `${selectedAgent.name} is responding...` : 'AI is responding...'
      if (sending) return selectedAgent ? `${selectedAgent.name} is thinking...` : 'Thinking...'
      if (hardLimitActive && tokensUsed >= contextLimit) return selectedAgent ? `Context limit reached for ${selectedAgent.name}` : 'Context limit reached'
      return selectedAgent ? `Ask ${selectedAgent.name}...` : 'Select an agent to start chatting'
    }

    const canSend = message.trim() && !disabled && !sending && !isStreamingEffective && selectedAgent && hasFunds

    // TipTap editor with Mention extension to treat mentions as atomic units
    const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)

    const MentionList = ({ items, command, clientRect }: any) => {
      const [active, setActive] = useState(0)
      useEffect(() => {
        setMentionActiveIndex(0)
      }, [items])
      useEffect(() => {
        setActive(mentionActiveIndex)
      }, [mentionActiveIndex])
      const style: React.CSSProperties = clientRect
        ? (() => {
            const rect = clientRect()
            return { position: 'fixed', left: rect.left, top: rect.bottom + 6, zIndex: 1000 }
          })()
        : { position: 'fixed', left: 0, top: 0, zIndex: 1000 }
      return (
        <div style={style} className="w-[min(420px,calc(100vw-40px))] max-h-64 overflow-auto rounded-lg border border-border/40 bg-popover/95 backdrop-blur-md shadow-frosted-lg p-1">
          {(Array.isArray(items) ? items : []).map((agent: AgentModel, idx: number) => (
            <button
              key={agent.id}
              type="button"
              className={cn(
                'w-full text-left px-3 py-2 rounded-sm transition-colors focus-visible-ring flex items-center gap-3 text-sm',
                idx === active ? 'bg-accent text-accent-foreground' : 'hover:bg-primary/5'
              )}
              onMouseEnter={() => setMentionActiveIndex(idx)}
              onMouseDown={e => {
                e.preventDefault()
                command(agent)
              }}
            >
              <Avatar className={cn('h-7 w-7 ring-1 ring-border/40')}>
                <AgentAvatar seed={agent.name} size={28} />
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium leading-5">{agent.name}</div>
                {agent.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</div>}
              </div>
            </button>
          ))}
        </div>
      )
    }

    const mentionSuggestion = {
      char: '@',
      allowSpaces: false,
      items: ({ query }: any) =>
        (agentsRef.current || [])
          .filter(a => {
            const q = String(query || '').toLowerCase()
            return !q || a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q)
          })
          .slice(0, 8),
      render: () => {
        let root: ReturnType<typeof createRoot> | null = null
        let container: HTMLDivElement | null = null
        return {
          onStart: (props: any) => {
            container = document.createElement('div')
            document.body.appendChild(container)
            root = createRoot(container)
            root.render(<MentionList items={props.items} command={(agent: AgentModel) => props.command({ id: agent.id, label: agent.name })} clientRect={props.clientRect} />)
          },
          onUpdate(props: any) {
            if (!root) return
            root.render(<MentionList items={props.items} command={(agent: AgentModel) => props.command({ id: agent.id, label: agent.name })} clientRect={props.clientRect} />)
          },
          onKeyDown(props: any) {
            if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(props.event.key)) {
              handleKeyDown(props.event)
              return true
            }
            return false
          },
          onExit() {
            if (root) root.unmount()
            root = null
            if (container && container.parentNode) container.parentNode.removeChild(container)
            container = null
          },
        }
      },
    }

    const placeholderText = useMemo(() => getPlaceholder(), [selectedAgent, isStreamingEffective, sending, hardLimitActive, tokensUsed, contextLimit])
    const tiptap = useEditor({
      extensions: [
        StarterKit.configure({ codeBlock: false, blockquote: false, heading: false, bulletList: false, orderedList: false }),
        Placeholder.configure({ placeholder: placeholderText }),
        Mention.configure({
          HTMLAttributes: {
            class: 'inline-flex items-center gap-1 align-baseline bg-primary/10 text-primary rounded-full px-1.5 py-0.5 border border-primary/20',
          },
          suggestion: mentionSuggestion,
        }),
      ],
      content: message,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: cn(
            'w-full bg-transparent outline-none',
            minimal ? 'min-h-[20px] max-h-[80px]' : 'min-h-[24px] max-h-[120px]',
            'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
            minimal && 'text-sm'
          ),
        },
        handleKeyDown: (_view, event) => {
          if (isMentionOpen) return false
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            handleSubmit()
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor }) => {
        setMessage(editor.getText())
      },
    })
    editorRef.current = tiptap

    // Styling for react-mentions to match our textarea theme
    const inputMinHeight = minimal ? 20 : 24
    const inputMaxHeight = minimal ? 80 : 120
    const mentionsStyles = {
      control: {
        backgroundColor: 'transparent',
        color: 'hsl(var(--foreground))',
        font: 'inherit',
      },
      highlighter: {
        padding: 0,
        border: 0,
        backgroundColor: 'transparent',
        color: 'hsl(var(--foreground))',
        font: 'inherit',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: `${inputMinHeight}px`,
        maxHeight: `${inputMaxHeight}px`,
        overflowY: 'auto',
      },
      input: {
        padding: 0,
        border: 0,
        outline: 0,
        backgroundColor: 'transparent',
        color: 'hsl(var(--foreground))',
        caretColor: 'hsl(var(--foreground))',
        font: 'inherit',
        whiteSpace: 'pre-wrap' as const,
        wordBreak: 'break-word' as const,
        minHeight: `${inputMinHeight}px`,
        maxHeight: `${inputMaxHeight}px`,
        overflowY: 'auto' as const,
        resize: 'none' as const,
      },
      suggestions: {
        list: {
          backgroundColor: 'hsl(var(--popover))',
          color: 'hsl(var(--popover-foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 25px -10px rgba(0,0,0,0.25)',
          padding: '0.25rem',
          zIndex: 50,
          maxHeight: '16rem',
          overflowY: 'auto' as const,
          backdropFilter: 'blur(6px)',
        },
        item: {
          padding: '0.375rem 0.5rem',
          borderRadius: '0.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
          '&focused': {
            backgroundColor: 'hsl(var(--accent))',
            color: 'hsl(var(--accent-foreground))',
          },
        },
      },
    }

    // =========================
    // Mention chip highlighter
    // =========================
    const escapeHtml = (str: string) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

    const highlightedHtml = useMemo(() => {
      const escaped = escapeHtml(message)
      // Wrap @mentions with a chip span. We keep a data-mention attribute for click handling.
      const withChips = escaped.replace(/(^|\s)(@[A-Za-z0-9_-]+)/g, (_m: string, p1: string, p2: string) => {
        const mentionText = p2
        const raw = mentionText.slice(1)
        return `${p1}<span data-mention="${raw}" class=\"inline-flex items-center gap-1 align-baseline bg-primary/10 text-primary rounded-full px-1.5 py-0.5 pointer-events-auto cursor-pointer border border-primary/20\">${mentionText}</span>`
      })
      return withChips.replace(/\n$/, '\n ')
    }, [message])

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const chip = target.closest('[data-mention]') as HTMLElement | null
      if (!chip) return
      const token = chip.getAttribute('data-mention') || ''
      if (!token) return
      const lower = token.toLowerCase()
      const agent = (starshipAgents as AgentModel[]).find(a => a.slug.toLowerCase() === lower || a.name.toLowerCase() === lower)
      if (agent && onAgentChange) onAgentChange(agent)
    }

    const filteredMentionAgents = (query: string) => {
      const q = (query || '').toLowerCase()
      return (starshipAgents as AgentModel[]).filter(a => !q || a.slug.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)).slice(0, 8)
    }

    const uiMentionOptions = useMemo(() => (isMentionOpen ? filteredMentionAgents(mentionQuery) : []), [isMentionOpen, mentionQuery, starshipAgents])

    const applyMentionChoice = (agent: AgentModel) => {
      if (mentionStartIndex == null) return
      const atIndex = mentionStartIndex
      const textarea = textareaRef.current
      const caret = textarea?.selectionStart ?? message.length
      const before = message.slice(0, atIndex)
      const after = message.slice(caret)
      // Complete the mention token with selected @slug and a trailing space
      const insertion = `@${agent.slug} `
      const next = `${before}${insertion}${after}`
      setMessage(next)
      setIsMentionOpen(false)
      setMentionQuery('')
      setMentionStartIndex(null)
      setTimeout(() => {
        try {
          if (textarea) {
            const newCaret = before.length + insertion.length
            textarea.focus()
            textarea.selectionStart = newCaret
            textarea.selectionEnd = newCaret
          }
        } catch {
          // ignore
        }
      }, 0)
    }

    // Expose methods to parent component via ref
    useImperativeHandle(
      ref,
      () => ({
        handleSuggestionSubmit,
        focusInput: () => {
          textareaRef.current?.focus()
        },
      }),
      [handleSuggestionSubmit]
    )

    return (
      <div className="relative opacity-100">
        {/* Professional insufficient balance indicator - Show when there is conversation ID */}
        {!hasFunds && conversationId && (
          <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-red-50/80 to-orange-50/60 dark:from-red-950/20 dark:to-orange-950/10 border border-red-200/50 dark:border-red-800/30 backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-900 dark:text-red-100 mb-1">Insufficient Balance</p>
                <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">Your account balance is too low to continue. Please add credits to keep chatting.</p>
              </div>
              <div className="flex-shrink-0">
                <TopupButton
                  starshipId={starshipId}
                  amount={20}
                  variant="default"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                />
              </div>
            </div>
          </div>
        )}
        {/* Input Container with Expandable Overlay */}
        <div
          className={cn(
            'relative transition-all overflow-visible',
            minimal
              ? 'frosted-glass-card rounded-xl shadow-frosted-lg focus-within:ring-1 focus-within:ring-primary/15'
              : 'frosted-glass-card rounded-2xl shadow-frosted-lg focus-within:ring-2 focus-within:ring-primary/20',
            'focus-within:border-primary/40',
            disabled && 'opacity-50'
          )}
        >
          {/* Expandable Message Overlay - Inside the input container */}
          {showExpandableOverlay && conversationId && <ExpandableMessageOverlay isExpanded={isOverlayExpanded} conversationId={conversationId} starshipId={starshipId} budgetTokens={budgetTokens} />}
          {/* Main Input Section - Only Text Input */}
          <div className={cn('flex items-end', minimal ? 'p-3' : 'p-4')}>
            {/* Removed tool builder button */}

            {/* Text Input (TipTap) */}
            <div className="flex-1 min-w-0">
              <EditorContent editor={tiptap} />
            </div>

            {/* Minimal mode: Send button on right */}
            {minimal && (
              <Button
                onClick={handleSubmit}
                disabled={!canSend}
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-full shrink-0 transition-all ml-2',
                  canSend ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl' : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                {sending || isStreamingEffective ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Icon name="send" className="h-4 w-4" />}
              </Button>
            )}
          </div>

          {/* Footer Section - Selectors and Action Buttons */}
          {!minimal && (
            <div className="border-t border-border/20 bg-muted/10 px-4 py-3">
              <div className="flex items-center justify-between">
                {/* Left Side - Selectors and Tool Button */}
                <div className="flex items-center gap-3">
                  {children}
                  {/* Removed tool builder button */}
                </div>

                {/* Right Side - Send Button */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSend}
                    size="icon"
                    className={cn(
                      'h-8 w-8 rounded-full shrink-0 transition-all',
                      canSend ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl' : 'bg-muted text-muted-foreground cursor-not-allowed'
                    )}
                  >
                    {sending || isStreamingEffective ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Icon name="send" className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Agent Indicator - Only show in non-minimal mode */}
        {!minimal && selectedAgent && (
          <div className="absolute -top-3 left-4 px-2 py-1 frosted-glass-light text-primary text-xs rounded-full">
            {isStreamingEffective ? `${selectedAgent.name} is responding...` : sending ? `${selectedAgent.name} is thinking...` : `Chatting with ${selectedAgent.name}`}
          </div>
        )}
      </div>
    )
  }
)

ConversationMessageInput.displayName = 'ConversationMessageInput'
