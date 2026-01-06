'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useCreateConversation, useConversationStop, useConversationDetail, useUpdateConversationState } from '@/hooks/useConversations'
import { useConversationStreamContext } from '@/hooks/ConversationStreamContext'
import { useConversationUsageTotals } from '@/hooks/useUsage'
import { useModelContextLength } from '@/hooks/useOpenRouterModels'
import { useWallet } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import type { AgentModel, ConversationState, ConversationPlugin } from '@starships/protocol'
import { useQueryClient } from '@tanstack/react-query'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, ReactRenderer, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import tippy from 'tippy.js'
// Using TipTap-native Suggestion renderer with tippy.js for positioning
// Using native textarea again; react-mentions kept internal mention state we no longer use
import { Avatar } from '@/components/ui/avatar'
import { agentAPI, templateAPI } from '@/lib/api'
import AgentAvatar from '@/components/animated/AgentAvatar'
// Tooltip no longer needed after removing tool builder button
import { ExpandableMessageOverlay } from './ExpandableMessageOverlay'
import Link from 'next/link'
import { toast } from 'sonner'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useFileUpload, useMessageAttachments, type PendingFile } from '@/hooks/useFileUpload'
import { generateId } from '@/lib/utils'
import { FileAttachmentPreview } from '@/components/conversation/FileAttachmentPreview'

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
  starshipSlug?: string
}

export interface ConversationMessageInputRef {
  handleSuggestionSubmit: (suggestion: string) => Promise<void>
  focusInput: () => void
  setLeadingMentionAgent: (agent: AgentModel, afterText?: string) => void
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
      starshipSlug,
    },
    ref
  ) => {
    const { userId } = useAuth()
    const queryClient = useQueryClient()
    const [message, setMessage] = useState('')
    const [sending, setSending] = useState(false)
    const isStarter = !conversationId

    // File upload state
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
    const [uploadedAttachmentIds, setUploadedAttachmentIds] = useState<string[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const attachmentContainerRef = useRef<HTMLDivElement>(null)
    const [attachmentHeight, setAttachmentHeight] = useState(0)
    const { uploadFile, uploading: fileUploading } = useFileUpload()

    // Measure attachment container height when files change (use layout effect for immediate measurement)
    useLayoutEffect(() => {
      if (attachmentContainerRef.current && pendingFiles.length > 0) {
        // Small delay to ensure DOM has fully rendered
        const timer = setTimeout(() => {
          if (attachmentContainerRef.current) {
            const height = attachmentContainerRef.current.offsetHeight
            // Only increase container height if attachments wrap to multiple rows
            // Single row height is ~40px (pill height), so only add padding if > 48px
            const SINGLE_ROW_HEIGHT = 48
            setAttachmentHeight(height > SINGLE_ROW_HEIGHT ? height : 0)
          }
        }, 0)
        return () => clearTimeout(timer)
      } else {
        setAttachmentHeight(0)
      }
    }, [pendingFiles])

    // Provide editor operations without referencing the editor before initialization
    const clearEditorRef = useRef<() => void>(() => {})

    const createConversation = useCreateConversation()
    const { data: wallet, isLoading } = useWallet(starshipId, !!starshipId)
    // Credits policy (server is authoritative; this is for UX only)
    const CREDITS_PER_MESSAGE = 10
    const LOW_WARNING_THRESHOLD = 50 // ~5 messages left
    const balanceNum = Number(wallet?.balance ?? '0')
    const hasFunds = balanceNum >= CREDITS_PER_MESSAGE
    const showLowBalanceWarning = Boolean(conversationId && !isLoading && hasFunds && balanceNum <= LOW_WARNING_THRESHOLD)

    // Determine current ship slug for billing URL
    const billingHref = `/ship/${starshipSlug}/settings/billing`

    // Load agents for @mention parsing
    const { data: starshipAgents = [] } = useStarshipAgents(starshipId, !!starshipId)
    const mentionAvatarAttachmentIds = useMemo(() => {
      return (Array.isArray(starshipAgents) ? (starshipAgents as AgentModel[]) : [])
        .map(a => (a as any)?.avatarAttachmentId as string | undefined)
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    }, [starshipAgents])
    const { data: mentionAvatarAttachments = [] } = useMessageAttachments(mentionAvatarAttachmentIds, starshipId)
    const mentionAvatarUrlById = useMemo(() => new Map(mentionAvatarAttachments.map(a => [a.id, a.previewUrl] as const)), [mentionAvatarAttachments])

    const agentsRef = useRef<AgentModel[]>([])
    const mentionAgentsSnapshotRef = useRef<AgentModel[] | null>(null)
    useEffect(() => {
      const latest = (starshipAgents as AgentModel[]) || []
      if (Array.isArray(latest) && latest.length > 0) {
        agentsRef.current = latest
      }
    }, [starshipAgents])

    // Stream state must come from the (single) ship-layout provider; no fallbacks.
    const { sendMessage: sendMessageFn, isSending, isResponding, isAssistantStreaming, isAwaitingAssistant, isAwaitingToolResults } = useConversationStreamContext()
    const stopConversation = useConversationStop()
    // Track last known conversationId to enable stop during pre-stream window and to bridge route transitions
    const lastConversationIdRef = useRef<string | null>(conversationId ?? null)
    useEffect(() => {
      if (conversationId) {
        lastConversationIdRef.current = conversationId
      }
    }, [conversationId])

    // Block input from the moment user sends until streaming completes.
    //
    // IMPORTANT:
    // During the /conversations -> /conversations/:id route handoff, the *new* input instance can render
    // before the UI store receives the optimistic `setConversationMeta(busy)` call. In that window,
    // store flags can be false even though streamedQuery already indicates responding.
    //
    // So we treat hook-level flags as a fallback even when an id exists.
    const hookBusy = Boolean(isSending || isResponding || isAssistantStreaming || isAwaitingAssistant || isAwaitingToolResults)
    const isStreamingEffective = Boolean(sending || hookBusy)
    const shouldShowStop = Boolean(sending || hookBusy)
    const showLoaderRing = Boolean(shouldShowStop)

    // Usage and context control
    const { data: totalsData } = useConversationUsageTotals(conversationId ?? null)
    const { contextLength: agentContextLength } = useModelContextLength(selectedAgent?.model || null)
    const tokensUsed = Number(totalsData?.totalTokens ?? 0)
    const contextLimit = Number(agentContextLength ?? 0)
    const hardLimitActive = !!conversationId && contextLimit > 0

    // Conversation state for web browsing toggle
    const { data: conversation, isLoading: isLoadingConversation } = useConversationDetail(conversationId ?? null)
    const updateConversationState = useUpdateConversationState()

    // Local state for web browsing preference before conversation exists
    const [pendingWebBrowsing, setPendingWebBrowsing] = useState(false)

    const hasWebBrowsing = useMemo(() => {
      // If conversation exists, use its state
      if (conversation?.state) {
        const state = conversation.state as ConversationState
        const plugins = state.plugins
        if (Array.isArray(plugins)) {
          return plugins.some((p: ConversationPlugin) => p?.id === 'web')
        }
      }
      // Otherwise use pending preference
      return pendingWebBrowsing
    }, [conversation?.state, pendingWebBrowsing])

    // Reset pending state when conversation is created
    useEffect(() => {
      if (conversationId && pendingWebBrowsing) {
        setPendingWebBrowsing(false)
      }
    }, [conversationId, pendingWebBrowsing])

    // Helper to apply pending web browsing preference to a newly created conversation
    // This is non-blocking - errors are handled by the mutation's onError handler
    const applyPendingWebBrowsing = useCallback(
      async (newConversationId: string): Promise<void> => {
        if (!pendingWebBrowsing) return

        try {
          // Apply the preference - mutation handles errors and shows toast internally
          await updateConversationState.mutateAsync({
            conversationId: newConversationId,
            state: {
              plugins: [{ id: 'web', max_results: 3 }],
            } as ConversationState,
          })
        } catch {
          // Error already handled by mutation's onError handler (shows toast)
          // Silently continue to avoid blocking message sending
        }
      },
      [pendingWebBrowsing, updateConversationState]
    )

    // Track previous streaming state to detect transition to complete and refocus input
    const prevIsStreamingRef = useRef(isStreamingEffective)

    // Keep InlineHint extension enablement in sync even when props change post-init
    const minimalRef = useRef(minimal)
    const disabledRef = useRef(disabled)
    const streamingRef = useRef(isStreamingEffective)
    const sendingRef = useRef(sending)
    useEffect(() => {
      minimalRef.current = minimal
    }, [minimal])
    useEffect(() => {
      disabledRef.current = disabled
    }, [disabled])
    useEffect(() => {
      // Sync ref from state, but preserve manual blocking during pre-stream window
      // Only sync when streaming is actually active OR when we're in idle state (not pre-stream pending)
      // This prevents the ref from being reset to false when conversationId changes during first message creation
      streamingRef.current = isStreamingEffective
    }, [isStreamingEffective])
    useEffect(() => {
      sendingRef.current = sending
    }, [sending])

    // Track whether TipTap Suggestion is active to gate Enter handling
    const isSuggestionActiveRef = useRef(false)
    // Track editor focus to control overlay visibility/mode
    const [isEditorFocused, setIsEditorFocused] = useState(false)

    // Consolidated focus management - handles all focus scenarios (moved below tiptap init)

    // Sync local 'sending' with streaming completion to avoid stuck disabled/loading state
    useEffect(() => {
      if (!isStreamingEffective && sending) {
        setSending(false)
      }
    }, [isStreamingEffective, sending])

    // File handling functions
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      // Store all selected files in browser memory - don't upload yet!
      const newPendingFiles: PendingFile[] = Array.from(files).map(file => ({
        file,
        id: generateId(),
        uploading: false,
        uploaded: false,
      }))

      setPendingFiles(prev => [...prev, ...newPendingFiles])

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }, [])

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) imageFiles.push(file)
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault()

        // Store all pasted images in state - don't upload yet!
        const newPendingFiles: PendingFile[] = imageFiles.map(file => ({
          file,
          id: generateId(),
          uploading: false,
          uploaded: false,
        }))
        setPendingFiles(prev => [...prev, ...newPendingFiles])
      }
    }, [])

    const handleRemoveFile = useCallback((fileId: string) => {
      setPendingFiles(prev => {
        const file = prev.find(f => f.id === fileId)
        if (file?.attachmentId) {
          setUploadedAttachmentIds(ids => ids.filter(id => id !== file.attachmentId))
        }
        return prev.filter(f => f.id !== fileId)
      })
    }, [])

    const handleSubmit = useCallback(async () => {
      const messageToSend = message.trim()
      // CRITICAL: Check if already blocked (synchronous ref check first)
      if (!messageToSend || sending || disabled || isStreamingEffective || streamingRef.current) return

      // CRITICAL: Set ref FIRST (synchronous, blocks subsequent calls immediately)
      streamingRef.current = true
      // Then set state (async, but ref already blocks)
      setSending(true)

      // Track the active conversation id within this send attempt (handles "create conversation" path)
      let sendConversationId: string | null = conversationId ?? null

      // Helper to reset flags if validation fails
      const resetFlags = () => {
        setSending(false)
        streamingRef.current = false
      }

      // Resolve agent to send to: prefer explicit leading @handle in content, else selectedAgent.
      // (No enforcement: the editor content is not mutated/prefilled anymore.)
      let effectiveAgent: AgentModel | null | undefined = selectedAgent ?? null
      let contentToSend = messageToSend
      // Also support plain-text leading @handle for safety
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
        resetFlags()
        toast.error('Select an agent', { description: 'Please select an agent to chat.' })
        return
      }

      // contentToSend already validated via messageToSend trim

      if (!starshipId) {
        resetFlags()
        toast.error('No starship selected', { description: 'Please select a ship before chatting.' })
        return
      }

      if (!userId) {
        resetFlags()
        toast.error('Authentication required', { description: 'Please sign in to continue.' })
        return
      }

      try {
        // Create conversation if one doesn't exist
        let currentConversationId = conversationId
        let createdNewConversation = false
        if (!currentConversationId) {
          const newConversation = await createConversation.mutateAsync({
            title: `Chat with ${formatAgentDisplayName(effectiveAgent)}`,
            starshipId: starshipId,
            agentSlug: effectiveAgent.slug,
          })
          currentConversationId = newConversation.id
          sendConversationId = currentConversationId
          createdNewConversation = true

          // Apply pending web browsing preference if enabled
          await applyPendingWebBrowsing(currentConversationId)
        }
        sendConversationId = currentConversationId!
        // Ensure local ref is updated immediately for stop button usability
        lastConversationIdRef.current = currentConversationId!

        // CRITICAL: pre-seed the streamed cache with a temp user message + local turn_started
        // BEFORE uploads / sendMessageFn() so the stream-derived responder state does not
        // briefly drop to idle during the /conversations -> /conversations/:id route change.
        try {
          const now = new Date().toISOString()
          const tempUser: any = {
            id: `temp-user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            role: 'user',
            content: contentToSend,
            createdAt: now,
            updatedAt: now,
            messageType: 'user_input',
            agentId: effectiveAgent!.id,
          }
          // Seed streamedQuery chunks; sendMessageMutation.onMutate will detect and avoid duplicating this.
          queryClient.setQueryData(['conversations', 'detail', currentConversationId!, 'messages'], (old: any[] | undefined) => {
            const next = Array.isArray(old) ? old.slice() : []
            const last = next.length > 0 ? next[next.length - 1] : null
            const prev = next.length > 1 ? next[next.length - 2] : null
            const already =
              last?.type === 'turn_started' &&
              last?.payload?.local === true &&
              prev?.type === 'append' &&
              prev?.message?.role === 'user' &&
              typeof prev?.message?.id === 'string' &&
              String(prev.message.id).startsWith('temp-user-') &&
              String(prev?.message?.content ?? '') === String(contentToSend)
            if (already) return next
            next.push({ type: 'append', message: tempUser })
            next.push({ type: 'turn_started', payload: { local: true, at: Date.now() } })
            return next
          })
        } catch {}

        // IMPORTANT: only after we seed the stream cache do we trigger the route transition.
        if (createdNewConversation) {
          onConversationStart?.(currentConversationId!)
        }

        // Clear composer
        setMessage('')
        try {
          clearEditorRef.current()
        } catch {}

        /* optimistic append skipped (server-SSE will add user message) */

        // Streaming UI is driven by TanStack Query status

        // Notify parent about message activity immediately (for UI state updates)
        onMessageSent?.()

        // Upload pending files if any
        const attachmentIdsToSend: string[] = []
        if (pendingFiles.length > 0) {
          for (const pendingFile of pendingFiles) {
            // Mark as uploading
            setPendingFiles(prev => prev.map(f => (f.id === pendingFile.id ? { ...f, uploading: true } : f)))

            try {
              const attachment = await uploadFile(pendingFile.file, currentConversationId!)
              if (attachment) {
                attachmentIdsToSend.push(attachment.id)
                setPendingFiles(prev => prev.map(f => (f.id === pendingFile.id ? { ...f, uploading: false, uploaded: true, attachmentId: attachment.id } : f)))
              } else {
                setPendingFiles(prev => prev.map(f => (f.id === pendingFile.id ? { ...f, uploading: false, error: 'Upload failed' } : f)))
                toast.error(`Failed to upload ${pendingFile.file.name}`)
              }
            } catch (error) {
              setPendingFiles(prev => prev.map(f => (f.id === pendingFile.id ? { ...f, uploading: false, error: 'Upload failed' } : f)))
              toast.error(`Failed to upload ${pendingFile.file.name}`)
            }
          }
        }

        // Fire-and-forget streaming; streaming lifecycle manages completion/cleanup
        void sendMessageFn({
          conversationId: currentConversationId!,
          agentId: effectiveAgent!.id,
          content: contentToSend,
          role: 'user',
          starshipId: starshipId!,
          messageType: 'user_input',
          attachmentIds: attachmentIdsToSend.length > 0 ? attachmentIdsToSend : undefined,
        })
          .catch(error => {
            toast.error('Failed to send message', { description: (error as any)?.message || 'Please try again.' })
            // Restore message on error
            setMessage(messageToSend)
          })
          .finally(() => {
            setSending(false)
            // Clear attachments after successful send
            setPendingFiles([])
            setUploadedAttachmentIds([])
          })

        // Exit early to avoid hitting catch/finally paths
        return
      } catch (error) {
        toast.error('Failed to send message', { description: (error as any)?.message || 'Please try again.' })
        // Restore message and ensure local sending cleared on immediate failure
        setMessage(messageToSend)
        setSending(false)
        streamingRef.current = false
      }
    }, [
      message,
      sending,
      disabled,
      isStreamingEffective,
      selectedAgent,
      userId,
      conversationId,
      createConversation,
      onConversationStart,
      onMessageSent,
      sendMessageFn,
      starshipId,
      onAgentChange,
      starshipAgents,
      queryClient,
      applyPendingWebBrowsing,
    ])

    // Handle suggestion clicks
    const handleSuggestionSubmit = useCallback(
      async (suggestionText: string) => {
        // CRITICAL: Check if already blocked (synchronous ref check first)
        if (!suggestionText || sending || disabled || isStreamingEffective || streamingRef.current) return

        // CRITICAL: Set ref FIRST (synchronous, blocks subsequent calls immediately)
        streamingRef.current = true
        // Then set state (async, but ref already blocks)
        setSending(true)

        let sendConversationId: string | null = conversationId ?? null
        let createdNewConversation = false

        // Helper to reset flags if validation fails
        const resetFlags = () => {
          setSending(false)
          streamingRef.current = false
        }

        // Validation for agent and starship
        if (!selectedAgent) {
          resetFlags()
          toast.error('Select an agent', { description: 'Please select an agent to chat.' })
          return
        }

        if (!starshipId) {
          resetFlags()
          toast.error('No starship selected', { description: 'Please select a ship before chatting.' })
          return
        }

        if (!userId) {
          resetFlags()
          toast.error('Authentication required', { description: 'Please sign in to continue.' })
          return
        }

        try {
          // Create conversation if one doesn't exist
          let currentConversationId = conversationId
          if (!currentConversationId) {
            const newConversation = await createConversation.mutateAsync({
              title: `Chat with ${formatAgentDisplayName(selectedAgent)}`,
              starshipId: starshipId,
              agentSlug: selectedAgent.slug,
            })
            currentConversationId = newConversation.id
            sendConversationId = currentConversationId
            createdNewConversation = true

            // Apply pending web browsing preference if enabled
            await applyPendingWebBrowsing(currentConversationId)
          }
          sendConversationId = currentConversationId!
          // Ensure local ref is updated immediately for stop button usability
          lastConversationIdRef.current = currentConversationId!

          // Trigger the route transition once the conversation exists.
          if (createdNewConversation) {
            onConversationStart?.(currentConversationId!)
          }

          /* optimistic append skipped (server-SSE will add user message) */

          // Streaming UI is driven by TanStack Query status

          // Notify parent about message activity immediately (for UI state updates)
          onMessageSent?.()

          const contentWithMention = `${suggestionText}`

          // Fire-and-forget streaming; streaming lifecycle manages completion/cleanup
          void sendMessageFn({
            conversationId: currentConversationId!,
            agentId: selectedAgent!.id,
            content: contentWithMention,
            role: 'user',
            starshipId: starshipId!,
            messageType: 'user_input',
          })
            .catch(error => {
              toast.error('Failed to send suggestion', { description: (error as any)?.message || 'Please try again.' })
              streamingRef.current = false
            })
            .finally(() => {
              setSending(false)
            })

          return
        } catch (error) {
          toast.error('Failed to send suggestion', { description: (error as any)?.message || 'Please try again.' })
          setSending(false)
          streamingRef.current = false
        }
      },
      [sending, disabled, isStreamingEffective, selectedAgent, userId, conversationId, createConversation, onConversationStart, onMessageSent, sendMessageFn, starshipId, applyPendingWebBrowsing]
    )

    // Resolve the agent we should use for UI hints/prompts: prefer the leading @mention if present
    const promptAgent: AgentModel | null = useMemo(() => {
      return selectedAgent ?? null
    }, [selectedAgent])

    const getPlaceholder = () => {
      if (isStreamingEffective) return promptAgent ? `${promptAgent.name} is responding...` : 'AI is responding...'
      if (sending) return promptAgent ? `${promptAgent.name} is thinking...` : 'Thinking...'
      if (hardLimitActive && tokensUsed >= contextLimit) return promptAgent ? `Context limit reached for ${promptAgent.name}` : 'Context limit reached'
      if (!promptAgent) return 'Select an agent to assign a task or ask anything'
      // Show placeholder even after the conversation has started.
      return `Assign a task to ${promptAgent.name} or ask anything`
    }

    // Track if there's actual content beyond just the mention and space
    const [hasActualContent, setHasActualContent] = useState(false)

    // Require balance; server also enforces funds.
    const hasTargetAgent = Boolean(selectedAgent) || message.trim().startsWith('@')
    const canSend = hasActualContent && hasTargetAgent && !disabled && !sending && !isStreamingEffective && hasFunds

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
      const activeItemRef = useRef<HTMLButtonElement | null>(null)

      // Scroll active item into view when active index changes
      useEffect(() => {
        if (activeItemRef.current) {
          activeItemRef.current.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
          })
        }
      }, [active])

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
      const style: React.CSSProperties | undefined = anchorRect ? { position: 'fixed', left, top, zIndex: 9999, width: menuWidth, willChange: 'transform' } : undefined
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
              ref={idx === active ? activeItemRef : null}
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
                <AgentAvatar seed={agent.name} imageUrl={mentionAvatarUrlById.get((agent as any).avatarAttachmentId)} size={28} />
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium leading-5">{formatAgentDisplayName(agent)}</div>
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
          .map((a: AgentModel) => ({ id: a.id, label: formatAgentDisplayName(a), agent: a })),
      render: () => {
        let component: ReactRenderer | null = null
        let popup: any = null
        let active = 0
        let lastProps: any = null
        let lastQuery: string = ''

        const cleanupTrailingQueryAfterMention = (ed: any, query: string) => {
          try {
            if (!ed) return
            const q = String(query || '').trim()
            if (!q) return

            const state = ed.state
            const pos = state.selection?.from || 0
            if (pos < 1) return

            // Look for the query text immediately after cursor, accounting for optional space
            const checkRange = Math.min(20, q.length + 2) // Safety limit
            const textAhead = state.doc.textBetween(pos, pos + checkRange, '\n')

            // Try to find the query with or without leading space
            let matchStart = -1
            let matchEnd = -1

            if (textAhead.startsWith(q)) {
              matchStart = pos
              matchEnd = pos + q.length
            } else if (textAhead.startsWith(' ' + q)) {
              matchStart = pos + 1
              matchEnd = pos + 1 + q.length
            }

            // Only delete if we found an exact match
            if (matchStart >= 0 && matchEnd > matchStart) {
              ed.chain()?.setTextSelection({ from: matchStart, to: matchEnd })?.deleteSelection()?.run()
            }
          } catch {}
        }
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
                try {
                  cleanupTrailingQueryAfterMention(lastProps.editor, lastQuery)
                } catch {}
                // Update selected agent (mirror mouse selection)
                try {
                  const id = (choice as any)?.id
                  const label = (choice as any)?.label
                  let agent = (agentsRef.current || []).find(a => a.id === id) || null
                  if (!agent && label) {
                    const lower = String(label).toLowerCase()
                    agent = (agentsRef.current || []).find(a => a.name.toLowerCase() === lower || a.slug.toLowerCase() === lower) || null
                  }
                  if (agent) {
                    onAgentChange?.(agent)
                  }
                } catch {}
              } catch {}
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
            lastQuery = String(props?.query || '')

            component = new ReactRenderer(MentionList as any, {
              props: {
                items: (props.items as Array<{ id: string; label: string; agent?: AgentModel }>).map(i => i.agent || (agentsRef.current || []).find(a => a.id === i.id)).filter(Boolean),
                active,
                onHover: (i: number) => {
                  active = i
                  component?.updateProps({ ...component.props, active })
                },
                command: (agent: AgentModel) => {
                  const realItem = (props.items as any[]).find(i => i.id === agent.id) || { id: agent.id, label: formatAgentDisplayName(agent) }
                  // Insert/replace with the mention node
                  props.command(realItem)
                  try {
                    cleanupTrailingQueryAfterMention(props.editor, lastQuery)
                  } catch {}
                  // Then update selected agent and mark as user-driven choice
                  try {
                    const selected = (agentsRef.current || []).find(a => a.id === realItem.id) || agent
                    if (onAgentChange) {
                      onAgentChange(selected)
                    }
                  } catch {}
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
              zIndex: 9999,
            })

            // Capture keyboard navigation globally while menu is open
            try {
              document.addEventListener('keydown', handleDocKeyDown, true)
            } catch {}
          },
          onUpdate(props: any) {
            // Preserve previous query to detect filter changes
            const prevQuery = String(lastQuery || '')
            lastProps = props
            lastQuery = String(props?.query || '')

            const newItems = (props.items as Array<{ id: string; label: string; agent?: AgentModel }>).map(i => i.agent || (agentsRef.current || []).find(a => a.id === i.id)).filter(Boolean)

            // Reset active to the first filtered item when query changes or when active is out of bounds
            if (lastQuery !== prevQuery || active < 0 || active >= newItems.length) {
              active = newItems.length > 0 ? 0 : 0
            }

            component?.updateProps({
              ...component.props,
              items: newItems,
              active,
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
                  try {
                    cleanupTrailingQueryAfterMention(props.editor, lastQuery)
                  } catch {}
                  // Update selected agent state (mirror mouse path)
                  try {
                    const id = (choice as any)?.id
                    const label = (choice as any)?.label
                    let agent = (agentsRef.current || []).find(a => a.id === id) || null
                    if (!agent && label) {
                      const lower = String(label).toLowerCase()
                      agent = (agentsRef.current || []).find(a => a.name.toLowerCase() === lower || a.slug.toLowerCase() === lower) || null
                    }
                    if (agent) {
                      onAgentChange?.(agent)
                    }
                  } catch {}
                } catch (err) {
                  try {
                    const label = (choice as any)?.label || ''
                    const ed = props.editor
                    ed?.chain()?.focus()?.insertContent(`@${label}`)?.run()
                    const end = ed?.state?.selection?.from || 0
                    const totalLen = String(label).length + 1
                    const from = Math.max(0, end - totalLen)
                    const to = end
                    ed?.chain()?.setTextSelection({ from, to })?.run()
                    try {
                      cleanupTrailingQueryAfterMention(ed, lastQuery)
                    } catch {}
                    // Best-effort agent resolution by label when fallback path used
                    try {
                      const lower = String(label).toLowerCase()
                      const agent = (agentsRef.current || []).find(a => a.name.toLowerCase() === lower || a.slug.toLowerCase() === lower) || null
                      if (agent && onAgentChange) {
                        onAgentChange(agent)
                      }
                    } catch {}
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
    const MentionNodeView = ({ node }: any) => {
      const id = node?.attrs?.id
      const label = node?.attrs?.label
      const agent = (agentsRef.current || []).find(a => a.id === id)
      const display = agent?.name || label || id || ''
      return (
        <NodeViewWrapper as="span" className="inline text-foreground" data-mention-node>
          <span
            className={cn(
              'inline-flex items-center gap-1 whitespace-nowrap cursor-pointer rounded px-1.5 py-[2px] bg-white/90 hover:bg-white dark:bg-white/20 dark:hover:bg-white/25 ring-1 ring-border/60 shadow-sm transition-all duration-200'
            )}
            contentEditable={false}
            style={{ pointerEvents: 'auto', verticalAlign: '-2px' }}
            role="button"
            tabIndex={0}
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
              // Don't allow inline editing - it creates confusing plain text instead of mention
              // Users should delete and retype to change mention
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                // Don't allow inline editing - it creates confusing plain text instead of mention
              }
            }}
          >
            <span className="flex-shrink-0 h-4 w-4 rounded-sm overflow-hidden">
              <AgentAvatar seed={display} imageUrl={agent ? mentionAvatarUrlById.get((agent as any).avatarAttachmentId) : undefined} size={16} />
            </span>
            <span className="font-medium text-base">@{display}</span>
          </span>
        </NodeViewWrapper>
      )
    }

    // Removed global capture listener to avoid recursive event dispatch; rely on element-level handlers

    const placeholderText = useMemo(() => getPlaceholder(), [selectedAgent, isStreamingEffective, sending, hardLimitActive, tokensUsed, contextLimit, conversationId])
    const placeholderRef = useRef<string>(placeholderText)
    useEffect(() => {
      placeholderRef.current = placeholderText
    }, [placeholderText])

    // Extract example prompts from the prompt agent (leading mention > selected agent) if present
    const examplePrompts: string[] = useMemo(() => {
      const a: any = promptAgent as any
      const list = a?.previewPrompts || a?.examplePrompts || a?.examples || a?.state?.examplePrompts || []
      return Array.isArray(list) ? (list as string[]).filter(Boolean) : []
    }, [promptAgent])

    // Merge with server-fetched agent/template preview prompts if not present
    const [templatePrompts, setTemplatePrompts] = useState<string[]>([])
    useEffect(() => {
      let aborted = false
      setTemplatePrompts([])
      const a: any = promptAgent as any
      // If agent already has prompts, skip
      if (examplePrompts.length > 0) return
      ;(async () => {
        try {
          // Try fetching full agent by id to hydrate previewPrompts
          if (a?.id) {
            const fresh = await agentAPI.getById(a.id)
            const freshPrompts: string[] = (fresh as any)?.previewPrompts || []
            if (!aborted && Array.isArray(freshPrompts) && freshPrompts.length > 0) {
              setTemplatePrompts(freshPrompts.filter(Boolean))
              return
            }
          }
        } catch {}
        try {
          // Fallback to template prompts when a sourceTemplateId exists
          const sourceTemplateId = a?.sourceTemplateId
          if (sourceTemplateId) {
            const tpl = await templateAPI.getById(sourceTemplateId)
            const previews = (tpl as any)?.previewPrompts || []
            if (!aborted && Array.isArray(previews) && previews.length > 0) {
              setTemplatePrompts(previews.filter(Boolean))
              return
            }
          }
        } catch {}
        try {
          // Last resort: fetch all templates and match by slug/name
          const all = await templateAPI.getAll()
          const lowerName = String(a?.name || '').toLowerCase()
          const lowerSlug = String(a?.slug || '').toLowerCase()
          const match = (all || []).find((t: any) => String(t?.slug || '').toLowerCase() === lowerSlug || String(t?.name || '').toLowerCase() === lowerName)
          const previews = (match as any)?.previewPrompts || []
          if (!aborted && Array.isArray(previews) && previews.length > 0) {
            setTemplatePrompts(previews.filter(Boolean))
            return
          }
        } catch {}
      })()
      return () => {
        aborted = true
      }
    }, [promptAgent, examplePrompts])

    const inlinePrompts: string[] = useMemo(() => {
      if (examplePrompts.length > 0) return examplePrompts
      if (templatePrompts.length > 0) return templatePrompts
      // Final fallback to ensure animated placeholder renders even if backend has no prompts yet
      return ['Design an agent that researches topics using Wikipedia', 'Create a customer support agent that can help users with common questions', 'Plan an onboarding workflow for new customers']
    }, [examplePrompts, templatePrompts])

    // Keep animated hint prompts reactive without re-initializing the TipTap extension
    const promptsRef = useRef<string[]>([])
    useEffect(() => {
      promptsRef.current = inlinePrompts
    }, [inlinePrompts])

    const tiptap = useEditor({
      extensions: [
        StarterKit.configure({ codeBlock: false, blockquote: false, heading: false, bulletList: false, orderedList: false }),
        Placeholder.configure({ placeholder: () => placeholderRef.current }),
        Mention.extend({
          selectable: false,
          addNodeView() {
            return ReactNodeViewRenderer(MentionNodeView as any)
          },
        }).configure({
          // Mentions behave like normal atomic nodes (user can delete them).
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
            // Use a “normal” input font size for both starter + docked/minimal modes.
            'text-base',
            // Minimal mode should still feel comfortable (not cramped).
            minimal ? 'min-h-[36px] max-h-[140px]' : isStarter ? 'min-h-[96px] max-h-[300px]' : 'min-h-[64px] max-h-[220px]',
            'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
            // Minimal mode has a small min-height; center the baseline within that space.
            // This does not change font size or the overall component height.
            minimal && 'tiptap--minimal'
          ),
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': selectedAgent ? `Message ${formatAgentDisplayName(selectedAgent)}` : 'Message input',
        },
        handleKeyDown: (_view, event) => {
          if (isSuggestionActiveRef.current) {
            // Let the Suggestion plugin own all keys, including Enter/Tab, to avoid ordering issues
            return false
          }
          // Cmd/Ctrl+K to clear input
          if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            try {
              tiptap?.commands.clearContent()
              tiptap?.commands.focus()
            } catch {}
            return true
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            if (streamingRef.current) {
              event.preventDefault()
              return true
            }
            event.preventDefault()
            handleSubmit()
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor }) => {
        setMessage(editor.getText())
        setHasActualContent(Boolean(editor.getText().trim()))
      },
    })

    // Note: Removed forced dispatch that was causing cursor jumping issues
    // Modern TipTap should handle placeholder updates automatically

    // Bridge editor focus/blur to parent callbacks for overlay control and local focus state
    useEffect(() => {
      if (!tiptap) return
      const handleFocus = () => {
        try {
          setIsEditorFocused(true)
          onFocus?.()
        } catch {}
      }
      const handleBlur = () => {
        try {
          setIsEditorFocused(false)
          onBlur?.()
        } catch {}
      }
      try {
        ;(tiptap as any).on?.('focus', handleFocus)
        ;(tiptap as any).on?.('blur', handleBlur)
      } catch {}
      return () => {
        try {
          ;(tiptap as any).off?.('focus', handleFocus)
        } catch {}
        try {
          ;(tiptap as any).off?.('blur', handleBlur)
        } catch {}
      }
    }, [tiptap, onFocus, onBlur])

    // Note: removed “sticky leading mention” caret snapping + inline hint behavior.
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
        setLeadingMentionAgent: (agent: AgentModel, afterText?: string) => {
          try {
            if (agent && onAgentChange) onAgentChange(agent)
            if (!tiptap) return
            const text = typeof afterText === 'string' ? afterText.trim() : ''
            if (text.length > 0) {
              // Replace the composer content with the provided prompt (no automatic @mention insertion).
              setTimeout(() => {
                try {
                  tiptap.commands.setContent(text + ' ')
                  tiptap.commands.focus('end')
                } catch {}
              }, 0)
            } else {
              try {
                tiptap.commands.focus('end')
              } catch {}
            }
          } catch {}
        },
      }),
      [handleSuggestionSubmit, tiptap]
    )

    // Calculate context usage percentage for progress indicator
    const contextUsagePercent = contextLimit > 0 ? Math.min(100, (tokensUsed / contextLimit) * 100) : 0
    const contextWarningLevel = contextUsagePercent >= 90 ? 'critical' : contextUsagePercent >= 75 ? 'warning' : 'normal'

    return (
      <div className="relative opacity-100">
        <PlaceholderStyles />
        {/* Context Limit Progress Indicator - Show when context limit is active and usage > 50% */}
        {hardLimitActive && contextUsagePercent > 50 && !minimal && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/40">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <Icon
                  name="database"
                  className={cn('h-3.5 w-3.5', contextWarningLevel === 'critical' ? 'text-red-500' : contextWarningLevel === 'warning' ? 'text-orange-500' : 'text-muted-foreground')}
                />
                <span className="text-xs font-medium text-foreground">Context Usage</span>
              </div>
              <span
                className={cn(
                  'text-xs font-mono',
                  contextWarningLevel === 'critical'
                    ? 'text-red-600 dark:text-red-400 font-semibold'
                    : contextWarningLevel === 'warning'
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-muted-foreground'
                )}
              >
                {tokensUsed.toLocaleString()} / {contextLimit.toLocaleString()} tokens
              </span>
            </div>
            <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
                  contextWarningLevel === 'critical'
                    ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : contextWarningLevel === 'warning'
                      ? 'bg-gradient-to-r from-orange-400 to-orange-500'
                      : 'bg-gradient-to-r from-primary/60 to-primary'
                )}
                style={{ width: `${contextUsagePercent}%` }}
              />
            </div>
            {contextWarningLevel !== 'normal' && (
              <p className={cn('mt-1.5 text-xs', contextWarningLevel === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400')}>
                {contextWarningLevel === 'critical' ? '⚠️ Context limit almost reached. Consider starting a new conversation.' : '⚡ Approaching context limit. Messages may be truncated soon.'}
              </p>
            )}
          </div>
        )}
        {/* Low credits warning banner */}
        {showLowBalanceWarning && (
          <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-yellow-50/80 to-orange-50/60 dark:from-yellow-950/20 dark:to-orange-950/10 border border-yellow-200/50 dark:border-yellow-800/30 backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-1">Low credits</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 leading-relaxed">
                  You’re running low on credits. Each message costs {CREDITS_PER_MESSAGE} credits—add more to avoid interruptions.
                </p>
              </div>
              <div className="flex-shrink-0">
                <Link href={billingHref}>
                  <Button variant="default" size="sm" className="bg-amber-500 hover:bg-amber-600 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200 font-medium">
                    Get credits
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Professional insufficient credits indicator */}
        {!hasFunds && !isLoading && conversationId && (
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
                <p className="text-sm font-semibold text-red-900 dark:text-red-100 mb-1">Insufficient credits</p>
                <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">You need at least {CREDITS_PER_MESSAGE} credits to send a message. Please add credits to keep chatting.</p>
              </div>
              <div className="flex-shrink-0">
                <Link href={billingHref}>
                  <Button variant="default" size="sm" className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200 font-medium">
                    Get credits
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* File Attachments Preview - Outside input container in minimal mode */}
        {minimal && pendingFiles.length > 0 && (
          <div className="mb-2 px-1">
            <div className="bg-muted/30 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-border/40">
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map(file => (
                  <FileAttachmentPreview key={file.id} file={file} onRemove={() => handleRemoveFile(file.id)} uploading={file.uploading} minimal={true} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input Container with Expandable Overlay */}
        <div className={cn('relative transition-all overflow-visible bg-card border border-border/60 rounded-2xl shadow-sm', 'focus-within:border-primary/70', disabled && 'opacity-50')}>
          {/* Expandable Message Overlay - Inside the input container */}
          {showExpandableOverlay && conversationId && (
            <ExpandableMessageOverlay
              mode={isEditorFocused ? (isOverlayExpanded ? 'expanded' : 'semi') : 'collapsed'}
              conversationId={conversationId}
              starshipId={starshipId}
              budgetTokens={budgetTokens}
              onExpand={onToggleOverlay}
              onToggle={onToggleOverlay}
            />
          )}

          {/* Main Input Section - Text input with right-aligned actions */}
          <div className={cn('flex relative items-center', minimal ? 'pl-3 pr-2 py-2.5' : 'px-3 py-2.5')}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.html,.css,.js,.ts,.py,.java,.cpp,.c,.go,.rs,.rb,.php,.swift"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Optional left-side controls in expanded mode */}
            {!minimal && children && <div className="mr-3 flex items-center gap-3">{children}</div>}

            {/* Text Input (TipTap) with attachments */}
            <div
              className={cn('flex-1 min-w-0 pr-40 relative z-10')}
              onPaste={handlePaste}
              style={{
                paddingBottom: !minimal && attachmentHeight > 0 ? `${attachmentHeight}px` : undefined,
              }}
            >
              <div className="max-h-[300px] overflow-y-auto">
                <EditorContent editor={tiptap} />
              </div>

              {/* File Attachments Preview - Absolutely positioned at bottom in normal mode */}
              {!minimal && pendingFiles.length > 0 && (
                <div ref={attachmentContainerRef} className="absolute bottom-0 left-0 right-0 pr-40">
                  <div className="flex flex-wrap gap-2">
                    {pendingFiles.map(file => (
                      <FileAttachmentPreview key={file.id} file={file} onRemove={() => handleRemoveFile(file.id)} uploading={file.uploading} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right-side Action Buttons Container */}
            <div className={cn('absolute z-20 flex items-center gap-2', minimal ? 'top-1/2 -translate-y-1/2 right-2' : 'bottom-2.5 right-2')}>
              {/* Attachment Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || fileUploading}
                className={cn('p-1.5 rounded-lg transition-colors', 'hover:bg-muted text-muted-foreground hover:text-foreground', 'disabled:opacity-50 disabled:cursor-not-allowed')}
                aria-label="Attach file"
                title="Attach file (images, PDFs)"
              >
                <Icon name="paperclip" className="h-5 w-5" />
              </button>

              {/* Web Browsing Toggle Button - Available from the start */}
              <button
                onClick={() => {
                  if (conversationId) {
                    // Update existing conversation
                    const newPlugins: ConversationPlugin[] = hasWebBrowsing ? [] : [{ id: 'web', max_results: 3 }]
                    updateConversationState.mutate({
                      conversationId,
                      state: {
                        plugins: newPlugins,
                      } as ConversationState,
                    })
                  } else {
                    // Store preference for when conversation is created
                    setPendingWebBrowsing(!pendingWebBrowsing)
                  }
                }}
                disabled={updateConversationState.isPending || isLoadingConversation || isStreamingEffective}
                className={cn(
                  'group flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors',
                  hasWebBrowsing ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                aria-label={hasWebBrowsing ? 'Disable web browsing' : 'Enable web browsing'}
                title={hasWebBrowsing ? 'Web browsing enabled - Click to disable' : 'Web browsing disabled - Click to enable ($4 per 1,000 results)'}
              >
                {hasWebBrowsing ? (
                  <>
                    <div className="relative h-5 w-5 flex items-center justify-center flex-shrink-0">
                      <Icon name="globe" className="h-5 w-5 absolute transition-opacity group-hover:opacity-0" />
                      <Icon name="x" className="h-5 w-5 absolute opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap">Search</span>
                  </>
                ) : (
                  <Icon name="globe" className="h-5 w-5" />
                )}
              </button>

              {/* Stop (when streaming) or Send Button */}
              {shouldShowStop ? (
                <div className="relative h-8 w-8">
                  <Button
                    onClick={() => {
                      const id = lastConversationIdRef.current
                      if (!id) return
                      void stopConversation(id)
                    }}
                    variant="outline"
                    size="icon"
                    className={cn('h-8 w-8 rounded-full shrink-0 transition-all border-primary text-primary hover:bg-primary/10 relative z-10')}
                    aria-label="Stop response"
                    title="Stop response"
                  >
                    <Icon name="stop" weight="fill" className="h-4 w-4" />
                  </Button>
                  {showLoaderRing && <div aria-hidden className="pointer-events-none absolute -inset-0.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />}
                </div>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!canSend}
                  size="icon"
                  className={cn(
                    'h-8 w-8 rounded-full shrink-0 transition-all',
                    canSend ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl' : 'bg-muted text-muted-foreground cursor-not-allowed'
                  )}
                  aria-label="Send"
                  title={canSend ? 'Send' : !hasTargetAgent ? 'Select an agent to send' : 'Send'}
                >
                  {sending ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Icon name="send" className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Cost hint (non-minimal) - moved below the composer */}
        {!minimal && (
          <div className="mt-2 px-1 text-xs text-muted-foreground text-right">
            Each user message costs
            {'\u00A0'}
            <span className="ml-1 font-semibold text-muted-foreground">
              <Icon name="coins" className="inline-block h-3 w-3 align-text-bottom text-muted-foreground mr-1" />
              {CREDITS_PER_MESSAGE} credits
            </span>
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
    <style>{`
      .tiptap p.is-editor-empty:first-child::before,
      .ProseMirror p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        float: left;
        height: 0;
        pointer-events: none;
        color: hsl(var(--muted-foreground));
        opacity: 0.7;
      }
      .tiptap { line-height: 1.5; }
      .tiptap p { margin: 0; }
      /* Minimal mode: vertically center the single-line baseline within the min-height editor box. */
      .tiptap.tiptap--minimal {
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      /* Minimal mode placeholder: center it too (only applies when empty). */
      .tiptap.tiptap--minimal p.is-editor-empty:first-child {
        position: relative;
      }
      .tiptap.tiptap--minimal p.is-editor-empty:first-child::before {
        float: none;
        height: auto;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
      }
    `}</style>
  )
}
