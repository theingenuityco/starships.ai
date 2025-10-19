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

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, ReactRenderer, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import tippy from 'tippy.js'
// Using TipTap-native Suggestion renderer with tippy.js for positioning
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

    // Provide editor operations without referencing the editor before initialization
    const clearEditorRef = useRef<() => void>(() => {})

    const createConversation = useCreateConversation()
    const { data: wallet } = useWallet(starshipId, !!starshipId)
    const MINIMUM_THRESHOLD = 0.05
    const hasFunds = Number(wallet?.balance ?? '0') >= MINIMUM_THRESHOLD

    // Load agents for @mention parsing
    const { data: starshipAgents = [] } = useStarshipAgents(starshipId, !!starshipId)
    const agentsRef = useRef<AgentModel[]>([])
    const mentionAgentsSnapshotRef = useRef<AgentModel[] | null>(null)
    useEffect(() => {
      const latest = (starshipAgents as AgentModel[]) || []
      if (Array.isArray(latest) && latest.length > 0) {
        agentsRef.current = latest
      }
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

    // Track whether TipTap Suggestion is active to gate Enter handling
    const isSuggestionActiveRef = useRef(false)

    // Consolidated focus management - handles all focus scenarios (moved below tiptap init)

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
          // Do NOT strip the leading mention; keep it in the message content
          if (onAgentChange) onAgentChange(matched)
        }
      }

      // Validation for agent and starship
      if (!effectiveAgent) {
        toast.error('Select an agent', { description: 'Please select an agent to chat.' })
        return
      }

      // contentToSend already validated via messageToSend trim

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
        try {
          clearEditorRef.current()
        } catch {}

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

    const getPlaceholder = () => {
      if (isStreamingEffective) return selectedAgent ? `${selectedAgent.name} is responding...` : 'AI is responding...'
      if (sending) return selectedAgent ? `${selectedAgent.name} is thinking...` : 'Thinking...'
      if (hardLimitActive && tokensUsed >= contextLimit) return selectedAgent ? `Context limit reached for ${selectedAgent.name}` : 'Context limit reached'
      return selectedAgent ? `Ask ${selectedAgent.name}...` : 'Type @ to choose an agent, then ask your question'
    }

    const canSend = message.trim() && !disabled && !sending && !isStreamingEffective && selectedAgent && hasFunds

    // TipTap editor with Mention extension to treat mentions as atomic units

    const MentionList = ({
      items,
      command,
      anchorRect,
      active,
      onHover,
    }: {
      items: AgentModel[]
      command: (agent: AgentModel) => void
      anchorRect: DOMRect | null
      active: number
      onHover: (i: number) => void
    }) => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
      const vh = typeof window !== 'undefined' ? window.innerHeight : 768
      const menuWidth = Math.min(420, vw - 40)
      const maxH = 256
      const rect = anchorRect
      const top = rect
        ? (() => {
            const spaceBelow = vh - rect.bottom
            if (spaceBelow < maxH + 12) {
              return Math.max(8, rect.top - 6 - maxH)
            }
            return Math.min(vh - 8, rect.bottom + 6)
          })()
        : 0
      const left = rect ? Math.min(Math.max(8, rect.left), vw - menuWidth - 8) : 0
      const style: React.CSSProperties | undefined = anchorRect ? { position: 'fixed', left, top, zIndex: 1000, width: menuWidth, willChange: 'transform' } : undefined
      return (
        <div
          style={style}
          className="w-[min(420px,calc(100vw-40px))] max-h-64 overflow-auto rounded-lg border border-border/40 bg-popover/95 backdrop-blur-md shadow-frosted-lg p-1"
          role="listbox"
          aria-label="Agent suggestions"
        >
          {(Array.isArray(items) ? items : []).map((agent: AgentModel, idx: number) => (
            <button
              key={agent.id}
              id={`mention-option-${agent.id}`}
              type="button"
              tabIndex={-1}
              role="option"
              aria-selected={idx === active}
              className={cn(
                'w-full text-left px-3 py-2 rounded-sm transition-colors focus-visible-ring flex items-center gap-3 text-sm',
                idx === active ? 'bg-accent text-accent-foreground' : 'hover:bg-primary/5'
              )}
              onMouseEnter={() => onHover(idx)}
              onMouseDown={e => {
                e.preventDefault()
                e.stopPropagation()
                command(agent)
              }}
              onPointerDown={e => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
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
        ((mentionAgentsSnapshotRef.current && mentionAgentsSnapshotRef.current.length > 0 ? mentionAgentsSnapshotRef.current : agentsRef.current) || [])
          .filter(a => {
            const q = String(query || '').toLowerCase()
            return !q || a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q)
          })
          .slice(0, 8)
          .map((a: AgentModel) => ({ id: a.id, label: a.name, agent: a })),
      render: () => {
        let component: ReactRenderer | null = null
        let popup: any = null
        let active = 0
        let lastProps: any = null
        const handleDocKeyDown = (e: KeyboardEvent) => {
          if (!lastProps) return
          const items = (lastProps.items as Array<{ id: string; label: string; agent?: AgentModel }>) || []
          if (!items.length) return
          const pageSize = Math.max(1, Math.min(5, items.length))
          const key = e.key
          if (key === 'ArrowDown' || (key.toLowerCase() === 'n' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault()
            e.stopPropagation()
            active = (active + 1) % items.length
            component?.updateProps({ ...component?.props, active })
            return
          }
          if (key === 'ArrowUp' || (key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault()
            e.stopPropagation()
            active = (active - 1 + items.length) % items.length
            component?.updateProps({ ...component?.props, active })
            return
          }
          if (key === 'PageDown') {
            e.preventDefault()
            e.stopPropagation()
            active = Math.min(items.length - 1, active + pageSize)
            component?.updateProps({ ...component?.props, active })
            return
          }
          if (key === 'PageUp') {
            e.preventDefault()
            e.stopPropagation()
            active = Math.max(0, active - pageSize)
            component?.updateProps({ ...component?.props, active })
            return
          }
          if (key === 'Home') {
            e.preventDefault()
            e.stopPropagation()
            active = 0
            component?.updateProps({ ...component?.props, active })
            return
          }
          if (key === 'End') {
            e.preventDefault()
            e.stopPropagation()
            active = items.length - 1
            component?.updateProps({ ...component?.props, active })
            return
          }
          if (key === 'Enter' || key === 'Tab') {
            e.preventDefault()
            e.stopPropagation()
            const choice = items[active]
            if (choice) {
              try {
                lastProps.command(choice)
              } catch (err) {
                try {
                  const label = (choice as any)?.label || ''
                  lastProps.editor?.chain()?.focus()?.insertContent(`@${label}`)?.run()
                } catch {}
              }
            }
            return
          }
          if (key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            lastProps.exit?.()
          }
        }
        return {
          onStart: (props: any) => {
            isSuggestionActiveRef.current = true
            mentionAgentsSnapshotRef.current = Array.isArray(agentsRef.current) ? [...agentsRef.current] : []
            lastProps = props

            component = new ReactRenderer(MentionList as any, {
              props: {
                items: (props.items as Array<{ id: string; label: string; agent?: AgentModel }>).map(i => i.agent || (agentsRef.current || []).find(a => a.id === i.id)).filter(Boolean),
                active,
                onHover: (i: number) => {
                  active = i
                  component?.updateProps({ ...component.props, active })
                },
                command: (agent: AgentModel) => {
                  const realItem = (props.items as any[]).find(i => i.id === agent.id) || { id: agent.id, label: agent.name }
                  // Update selected agent without altering editor text
                  try {
                    const selected = (agentsRef.current || []).find(a => a.id === realItem.id) || agent
                    onAgentChange?.(selected)
                  } catch {}
                  props.command(realItem)
                },
                anchorRect: null,
              },
              editor: props.editor,
            })

            // Keep editor focused; Suggestion plugin handles keys

            popup = tippy('body', {
              getReferenceClientRect: props.clientRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: 'manual',
              placement: 'bottom-start',
              zIndex: 1000,
            })

            // Capture keyboard navigation globally while menu is open
            try {
              document.addEventListener('keydown', handleDocKeyDown, true)
            } catch {}
          },
          onUpdate(props: any) {
            lastProps = props
            component?.updateProps({
              ...component.props,
              items: (props.items as Array<{ id: string; label: string; agent?: AgentModel }>).map(i => i.agent || (agentsRef.current || []).find(a => a.id === i.id)).filter(Boolean),
            })
            popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect })
          },
          onKeyDown(props: any) {
            const event = props.event
            const key = event.key
            const items = props.items as Array<{ id: string; label: string; agent?: AgentModel }>
            if (!items || items.length === 0) return false

            const pageSize = Math.max(1, Math.min(5, items.length))
            if (key === 'ArrowDown' || (key.toLowerCase() === 'n' && (event.ctrlKey || event.metaKey))) {
              event.preventDefault()
              active = (active + 1) % items.length
              component?.updateProps({ ...component.props, active })
              return true
            }
            if (key === 'ArrowUp' || (key.toLowerCase() === 'p' && (event.ctrlKey || event.metaKey))) {
              event.preventDefault()
              active = (active - 1 + items.length) % items.length
              component?.updateProps({ ...component.props, active })
              return true
            }
            if (key === 'PageDown') {
              event.preventDefault()
              active = Math.min(items.length - 1, active + pageSize)
              component?.updateProps({ ...component.props, active })
              return true
            }
            if (key === 'PageUp') {
              event.preventDefault()
              active = Math.max(0, active - pageSize)
              component?.updateProps({ ...component.props, active })
              return true
            }
            if (key === 'Home') {
              event.preventDefault()
              active = 0
              component?.updateProps({ ...component.props, active })
              return true
            }
            if (key === 'End') {
              event.preventDefault()
              active = items.length - 1
              component?.updateProps({ ...component.props, active })
              return true
            }
            if (key === 'Enter' || key === 'Tab') {
              event.preventDefault()
              const choice = items[active]
              if (choice) {
                try {
                  props.command(choice)
                } catch (err) {
                  try {
                    const label = (choice as any)?.label || ''
                    props.editor?.chain()?.focus()?.insertContent(`@${label}`)?.run()
                  } catch {}
                }
              }
              return true
            }
            if (key === 'Escape') {
              event.preventDefault()
              return true
            }
            return false
          },
          onExit() {
            popup?.[0]?.destroy()
            try {
              document.removeEventListener('keydown', handleDocKeyDown, true)
            } catch {}
            component?.destroy()
            component = null
            popup = null
            isSuggestionActiveRef.current = false
            mentionAgentsSnapshotRef.current = null
            // Editor remains focused naturally
          },
        }
      },
    }

    // React NodeView for mention rendering using our avatar component
    const MentionNodeView = ({ node, updateAttributes, editor }: any) => {
      const id = node?.attrs?.id
      const label = node?.attrs?.label
      const agent = (agentsRef.current || []).find(a => a.id === id)
      const display = agent?.name || label || id || ''
      const anchorRef = useRef<HTMLSpanElement | null>(null)
      const popupRef = useRef<any>(null)
      const rendererRef = useRef<ReactRenderer | null>(null)

      const openSwitcher = () => {
        try {
          console.debug('[mention] openSwitcher:start', { hasAnchor: !!anchorRef.current, display })
        } catch {}
        try {
          const anchorEl = anchorRef.current
          if (!anchorEl) return
          // Destroy any existing
          try {
            popupRef.current?.destroy()
          } catch {}
          try {
            rendererRef.current?.destroy()
          } catch {}

          const items = (agentsRef.current || []) as AgentModel[]
          const currentIndex = Math.max(
            0,
            items.findIndex(a => a.id === id)
          )

          try {
            rendererRef.current = new ReactRenderer(MentionList as any, {
              props: {
                items,
                active: currentIndex,
                onHover: (i: number) => {
                  rendererRef.current?.updateProps({ ...rendererRef.current.props, active: i })
                },
                command: (newAgent: AgentModel) => {
                  try {
                    updateAttributes({ id: newAgent.id, label: newAgent.name })
                  } catch {}
                  try {
                    onAgentChange?.(newAgent)
                  } catch {}
                  try {
                    popupRef.current?.destroy()
                  } catch {}
                  try {
                    rendererRef.current?.destroy()
                  } catch {}
                },
                anchorRect: null,
              },
              editor,
            })
          } catch (err) {
            try {
              console.error('[mention] openSwitcher:renderer error', err)
            } catch {}
            return
          }
          try {
            console.debug('[mention] openSwitcher:renderer ready', { items: items.length, currentIndex })
          } catch {}

          popupRef.current = tippy(anchorEl, {
            content: rendererRef.current.element,
            appendTo: () => document.body,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            zIndex: 1000,
          })
          try {
            console.debug('[mention] openSwitcher:tippy created')
          } catch {}
          try {
            popupRef.current.show()
            console.debug('[mention] openSwitcher:tippy shown')
          } catch (err) {
            try {
              console.error('[mention] openSwitcher:show error', err)
            } catch {}
          }
        } catch {}
      }

      useEffect(() => {
        return () => {
          try {
            popupRef.current?.destroy()
          } catch {}
          try {
            rendererRef.current?.destroy()
          } catch {}
        }
      }, [])
      return (
        <NodeViewWrapper as="span" className="inline-flex items-baseline align-baseline leading-none text-foreground">
          <span
            className="inline-flex items-baseline align-baseline gap-1 cursor-pointer hover:opacity-90"
            contentEditable={false}
            style={{ pointerEvents: 'auto' }}
            ref={anchorRef}
            role="button"
            tabIndex={0}
            onMouseDown={e => {
              try {
                console.debug('[mention] onMouseDown', { isTrusted: (e as any)?.isTrusted, button: e.button, phase: e.eventPhase })
              } catch {}
              e.preventDefault()
              e.stopPropagation()
              // Defer to avoid ProseMirror selection interfering
              setTimeout(() => {
                try {
                  console.debug('[mention] onMouseDown:deferred open')
                } catch {}
                openSwitcher()
              }, 0)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                try {
                  console.debug('[mention] onKeyDown', { key: e.key })
                } catch {}
                e.preventDefault()
                e.stopPropagation()
                openSwitcher()
              }
            }}
          >
            <span className="relative top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-[3px] overflow-hidden">
              <AgentAvatar seed={display} size={16} />
            </span>
            <strong className="font-semibold">@{display}</strong>
          </span>
        </NodeViewWrapper>
      )
    }

    // Removed global capture listener to avoid recursive event dispatch; rely on element-level handlers

    const placeholderText = useMemo(() => getPlaceholder(), [selectedAgent, isStreamingEffective, sending, hardLimitActive, tokensUsed, contextLimit])
    const tiptap = useEditor({
      extensions: [
        StarterKit.configure({ codeBlock: false, blockquote: false, heading: false, bulletList: false, orderedList: false }),
        Placeholder.configure({ placeholder: placeholderText }),
        Mention.extend({
          selectable: true,
          addNodeView() {
            return ReactNodeViewRenderer(MentionNodeView as any)
          },
        }).configure({
          deleteTriggerWithBackspace: true,
          // Force display as @name by resolving the agent name from id if needed
          renderText: ({ options, node }: any) => {
            const id = node?.attrs?.id
            const label = node?.attrs?.label
            const agent = (agentsRef.current || []).find(a => a.id === id)
            const display = agent?.name || label || id || ''
            return `${options.suggestion.char}${display}`
          },
          suggestion: mentionSuggestion,
        }),
      ],
      content: message,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: cn(
            'tiptap w-full bg-transparent outline-none',
            minimal ? 'min-h-[20px] max-h-[80px]' : 'min-h-[24px] max-h-[120px]',
            'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
            minimal && 'text-sm'
          ),
        },
        handleKeyDown: (_view, event) => {
          if (isSuggestionActiveRef.current) {
            // Let the Suggestion plugin own all keys, including Enter/Tab, to avoid ordering issues
            return false
          }
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
    // Wire editor-dependent helpers
    useEffect(() => {
      clearEditorRef.current = () => {
        try {
          tiptap?.commands.setContent('')
        } catch {}
      }
      return () => {
        clearEditorRef.current = () => {}
      }
    }, [tiptap])
    // Consolidated focus management - handles all focus scenarios (requires tiptap)
    useEffect(() => {
      const shouldFocus = () => {
        if (disabled || isStreamingEffective || sending) return false
        return true
      }
      const wasStreaming = prevIsStreamingRef.current
      const streamingCompleted = wasStreaming && !isStreamingEffective
      if (tiptap && shouldFocus()) {
        const delay = streamingCompleted ? 50 : 100
        const timer = setTimeout(() => {
          try {
            tiptap.commands.focus('end')
          } catch {}
        }, delay)
        prevIsStreamingRef.current = isStreamingEffective
        return () => clearTimeout(timer)
      }
      prevIsStreamingRef.current = isStreamingEffective
    }, [tiptap, disabled, isStreamingEffective, sending, selectedAgent, conversationId])
    // Expose methods to parent component via ref
    useImperativeHandle(
      ref,
      () => ({
        handleSuggestionSubmit,
        focusInput: () => {
          try {
            tiptap?.commands.focus('end')
          } catch {}
        },
      }),
      [handleSuggestionSubmit, tiptap]
    )

    return (
      <div className="relative opacity-100">
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .tiptap p.is-editor-empty:first-child::before,
            .ProseMirror p.is-editor-empty:first-child::before {
              content: attr(data-placeholder);
              float: left;
              height: 0;
              pointer-events: none;
              color: hsl(var(--muted-foreground));
              opacity: 0.7;
            }
          `,
          }}
        />
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
          <div className={cn('flex', minimal ? 'items-center p-3' : 'items-end p-4')}>
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

// Global placeholder styling for TipTap Placeholder extension
// Ensures the placeholder text is rendered when editor is empty
export function PlaceholderStyles() {
  return (
    <style
      // styled-jsx global to avoid scoping issues
      dangerouslySetInnerHTML={{
        __html: `
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
          color: hsl(var(--muted-foreground));
          opacity: 0.7;
        }
      `,
      }}
    />
  )
}
