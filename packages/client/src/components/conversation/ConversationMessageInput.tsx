'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { EmojiPicker } from '@/components/emoji/EmojiPicker'
import { useAuth } from '@/hooks/useAuth'
import {
  CONVERSATION_QUERY_KEYS,
  useCreateConversation,
  useCreateDirectMessage,
  useConversationStop,
  useConversationDetail,
  useConversationAgents,
  usePendingToolApprovals,
  useStarshipDirectMessages,
  useStarshipChannels,
  useLinkMessageToConversation,
  useUpdateConversationState,
} from '@/hooks/useConversations'
import { useConversationStreamContext } from '@/hooks/ConversationStreamContext'
import { useConversationContextUsage } from '@/hooks/useConversationContextUsage'
import { useWallet } from '@/hooks/useWallet'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import type { AgentModel, ConversationState, ConversationPlugin } from '@starships/protocol'
import { useQueryClient } from '@tanstack/react-query'
import { ToolApprovalCallout } from '@/components/conversation/ToolApprovalCallout'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, ReactRenderer, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import tippy from 'tippy.js'
// Using TipTap-native Suggestion renderer with tippy.js for positioning
// Using native textarea again; react-mentions kept internal mention state we no longer use
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import api, { agentAPI, templateAPI } from '@/lib/api'
import AgentAvatar from '@/components/animated/AgentAvatar'
// Tooltip no longer needed after removing tool builder button
import { ExpandableMessageOverlay } from './ExpandableMessageOverlay'
import Link from 'next/link'
import { toast } from 'sonner'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipMembersAndInvites, type StarshipMemberListItem } from '@/hooks/useStarshipMembers'
import { useFileUpload, useMessageAttachments, type PendingFile } from '@/hooks/useFileUpload'
import { generateId } from '@/lib/utils'
import { FileAttachmentPreview } from '@/components/conversation/FileAttachmentPreview'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { useStarshipPresence } from '@/hooks/useStarshipPresence'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { getSafeErrorMessage } from '@/lib/error-utils'

interface ConversationMessageInputProps {
  selectedAgent?: AgentModel | null
  starshipId: string
  conversationId?: string | null
  /** Optional: when composing inside a room thread, pass the room conversation id for invite-on-mention. */
  roomConversationId?: string | null
  onConversationStart?: (conversationId: string) => void
  /**
   * Optional: draft direct message target.
   * When provided AND `conversationId` is null, the DM is created/resolved on first send.
   */
  draftDirectMessageTarget?: { dmType: 'user_agent' | 'user_user'; agentId?: string | null; peerUserId?: string | null; title?: string | null } | null
  /**
   * Optional: when creating a new conversation (conversationId is null), create it as a child of this parent conversation.
   * Used for "draft threads" opened from a channel message.
   */
  newConversationParentConversationId?: string | null
  /** Optional: override the title used when creating a new conversation. */
  newConversationTitleOverride?: string | null
  /**
   * Optional: after creating a new conversation, link an existing parent message to it (persisted on server).
   * Used to persist the thread link only when the user sends the first reply in the draft thread.
   */
  linkMessageToNewConversation?: {
    parentConversationId: string
    messageId: string
    content: string
    createdAt?: string | null
    role?: string | null
    userName?: string | null
    agentName?: string | null
    attachmentIds?: string[] | null
  } | null
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
  /** Optional allowlists to scope @mention suggestions (users). */
  allowedMentionUserIds?: string[] | null
  /** Optional allowlists to scope @mention suggestions (agents). */
  allowedMentionAgentIds?: string[] | null
  /** Optional allowlists to scope execution agent selection. */
  allowedAgentIds?: string[] | null
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
      roomConversationId,
      onConversationStart,
      draftDirectMessageTarget,
      newConversationParentConversationId,
      newConversationTitleOverride,
      linkMessageToNewConversation,
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
      allowedMentionUserIds,
      allowedMentionAgentIds,
      allowedAgentIds,
    },
    ref
  ) => {
    const { userId, userName, userEmail, userAvatar, isInstanceAdmin } = useAuth()
    const queryClient = useQueryClient()
    const [message, setMessage] = useState('')
    const [sending, setSending] = useState(false)
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
    const isStarter = !conversationId
    const isExpandedStarterLayout = Boolean(isStarter && !minimal)
    // Load channels so we can detect "channel context" for both channel roots AND channel threads.
    // (Channel threads have conversationId != channelConversationId, so we must check parentConversationId.)
    const { data: channelsData } = useStarshipChannels(
      starshipId,
      Boolean(starshipId && (conversationId || (typeof newConversationParentConversationId === 'string' && newConversationParentConversationId.trim().length > 0)))
    )

    const isChannelRootConversation = useMemo(() => {
      const cid = typeof conversationId === 'string' ? conversationId : ''
      if (!cid) return false
      const channels = (channelsData as any)?.channels
      if (!Array.isArray(channels)) return false
      return channels.some((c: any) => String(c?.conversationId || '') === cid)
    }, [channelsData, conversationId])

    // Conversation state for web browsing toggle
    const { data: conversation, isLoading: isLoadingConversation } = useConversationDetail(conversationId ?? null)

    const isChannelContext = useMemo(() => {
      const channels = (channelsData as any)?.channels
      if (!Array.isArray(channels) || channels.length === 0) {
        // Best-effort:
        // - If we're creating a new child conversation and we don't yet have channel data,
        //   assume it's a channel thread (thread drafts are only created from channels in the UI).
        const draftParent = typeof newConversationParentConversationId === 'string' ? newConversationParentConversationId.trim() : ''
        return Boolean(draftParent)
      }

      const inList = (id: string) => channels.some((c: any) => String(c?.conversationId || '') === id)

      const cid = typeof conversationId === 'string' ? conversationId.trim() : ''
      if (cid && inList(cid)) return true

      const parentId = typeof conversation?.parentConversationId === 'string' ? conversation.parentConversationId.trim() : ''
      if (parentId && inList(parentId)) return true

      const draftParent = typeof newConversationParentConversationId === 'string' ? newConversationParentConversationId.trim() : ''
      if (draftParent && inList(draftParent)) return true

      return false
    }, [channelsData, conversationId, conversation?.parentConversationId, newConversationParentConversationId])

    // DM context (used for mention restrictions)
    const { data: directMessagesData } = useStarshipDirectMessages(starshipId, Boolean(starshipId && conversationId && !isChannelContext))
    type DmMentionAllowed = { kind: 'agent' | 'user' | null; id: string | null }
    const dmMentionAllowedRef = useRef<DmMentionAllowed>({ kind: null, id: null })
    useEffect(() => {
      let kind: DmMentionAllowed['kind'] = null
      let id: string | null = null

      // Draft DM (no conversation yet): we already know the target
      if (!conversationId && draftDirectMessageTarget) {
        if (draftDirectMessageTarget.dmType === 'user_agent') {
          const aid = String(draftDirectMessageTarget.agentId || '').trim()
          if (aid) {
            kind = 'agent'
            id = aid
          }
        } else if (draftDirectMessageTarget.dmType === 'user_user') {
          const uid = String(draftDirectMessageTarget.peerUserId || '').trim()
          if (uid) {
            kind = 'user'
            id = uid
          }
        }
      }

      // Existing DM: resolve from starship DM list (usually already cached by sidebar)
      if (!id && conversationId) {
        const cid = String(conversationId || '').trim()
        const list = (directMessagesData as any)?.directMessages
        const items = Array.isArray(list) ? (list as any[]) : []
        const match = items.find(it => String(it?.dm?.conversationId || '') === cid) || null
        const dm = match?.dm
        if (dm && typeof dm === 'object') {
          const dmType = String((dm as any).dmType || '')
          if (dmType === 'user_agent') {
            const aid = String((dm as any).agentId || '').trim()
            if (aid) {
              kind = 'agent'
              id = aid
            }
          } else if (dmType === 'user_user') {
            const peerFromList = String(match?.peerUser?.id || '').trim()
            const a = String((dm as any).userAId || '').trim()
            const b = String((dm as any).userBId || '').trim()
            const me = String(userId || '').trim()
            const derivedPeer = me && a && b ? (me === a ? b : me === b ? a : '') : ''
            const peerId = peerFromList || derivedPeer
            if (peerId) {
              kind = 'user'
              id = peerId
            }
          }
        }
      }

      dmMentionAllowedRef.current = { kind, id }
    }, [conversationId, draftDirectMessageTarget, directMessagesData, userId])

    type ResolvedDmTarget = { dmType: 'user_agent'; agentId: string } | { dmType: 'user_user'; peerUserId: string } | null

    const resolvedDmTarget: ResolvedDmTarget = useMemo(() => {
      // Draft DM (no conversation yet): we already know the target
      if (!conversationId && draftDirectMessageTarget) {
        if (draftDirectMessageTarget.dmType === 'user_agent') {
          const agentId = String(draftDirectMessageTarget.agentId || '').trim()
          return agentId ? ({ dmType: 'user_agent', agentId } as const) : null
        }
        if (draftDirectMessageTarget.dmType === 'user_user') {
          const peerUserId = String(draftDirectMessageTarget.peerUserId || '').trim()
          return peerUserId ? ({ dmType: 'user_user', peerUserId } as const) : null
        }
      }

      // Existing DM: resolve from starship DM list (usually already cached by sidebar)
      if (conversationId && !isChannelContext) {
        const cid = String(conversationId || '').trim()
        const list = (directMessagesData as any)?.directMessages
        const items = Array.isArray(list) ? (list as any[]) : []
        const match = items.find(it => String(it?.dm?.conversationId || '') === cid) || null
        const dm = match?.dm
        if (dm && typeof dm === 'object') {
          const dmType = String((dm as any).dmType || '')
          if (dmType === 'user_agent') {
            const agentId = String((dm as any).agentId || '').trim()
            return agentId ? ({ dmType: 'user_agent', agentId } as const) : null
          }
          if (dmType === 'user_user') {
            const peerFromList = String(match?.peerUser?.id || '').trim()
            const a = String((dm as any).userAId || '').trim()
            const b = String((dm as any).userBId || '').trim()
            const me = String(userId || '').trim()
            const derivedPeer = me && a && b ? (me === a ? b : me === b ? a : '') : ''
            const peerUserId = peerFromList || derivedPeer
            return peerUserId ? ({ dmType: 'user_user', peerUserId } as const) : null
          }
        }
      }

      return null
    }, [conversationId, draftDirectMessageTarget, directMessagesData, isChannelContext, userId])

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
    // TipTap editor props can capture stale closures; use a ref for the latest submit handler.
    const submitRef = useRef<() => void>(() => {})

    const createConversation = useCreateConversation()
    const createDirectMessage = useCreateDirectMessage()
    const linkMessageToConversation = useLinkMessageToConversation()
    const { data: starshipForPerms } = useStarshipBySlug(starshipSlug || '', Boolean(starshipSlug))
    const canManageBilling = Boolean(isInstanceAdmin || (userId && starshipForPerms?.ownerId === userId))
    const { data: wallet, isLoading } = useWallet(starshipId, Boolean(starshipId && canManageBilling))
    // Credits policy (server is authoritative; this is for UX only)
    const CREDITS_PER_MESSAGE = 10
    const LOW_WARNING_THRESHOLD = 50 // ~5 messages left
    const balanceNum = Number(wallet?.balance ?? '0')

    // Determine current ship slug for billing URL
    const billingHref = `/ship/${starshipSlug}/settings/billing`

    // Load agents for @mention parsing
    const { data: starshipAgents = [] } = useStarshipAgents(starshipId, !!starshipId)
    const { data: membersData } = useStarshipMembersAndInvites(starshipId, Boolean(starshipId))
    const memberUsers: StarshipMemberListItem[] = useMemo(() => {
      const list = (membersData as any)?.members
      return Array.isArray(list) ? (list as StarshipMemberListItem[]) : []
    }, [membersData])

    // Allowlist semantics:
    // - undefined => unrestricted (non-room contexts)
    // - [] => restrict to none (e.g. room has no allowlisted agents)
    const allowedMentionUserIdSet = useMemo(() => {
      if (allowedMentionUserIds === undefined) return null
      const raw = Array.isArray(allowedMentionUserIds) ? allowedMentionUserIds : []
      return new Set(raw.map(x => String(x || '').trim()).filter(Boolean))
    }, [allowedMentionUserIds])

    const allowedMentionAgentIdSet = useMemo(() => {
      if (allowedMentionAgentIds === undefined) return null
      const raw = Array.isArray(allowedMentionAgentIds) ? allowedMentionAgentIds : []
      return new Set(raw.map(x => String(x || '').trim()).filter(Boolean))
    }, [allowedMentionAgentIds])

    const allowedAgentIdSet = useMemo(() => {
      if (allowedAgentIds === undefined) return null
      const raw = Array.isArray(allowedAgentIds) ? allowedAgentIds : []
      return new Set(raw.map(x => String(x || '').trim()).filter(Boolean))
    }, [allowedAgentIds])

    const starshipAgentsForExecution = useMemo(() => {
      const list = Array.isArray(starshipAgents) ? (starshipAgents as AgentModel[]) : []
      const allow = allowedAgentIdSet
      if (allow === null) return list
      return list.filter(a => allow.has(String((a as any)?.id || '').trim()))
    }, [allowedAgentIdSet, starshipAgents])

    // If the current selection becomes disallowed (e.g. room allowlist changes), clear it.
    useEffect(() => {
      const allow = allowedAgentIdSet
      const id = String((selectedAgent as any)?.id || '').trim()
      if (allow === null || !id) return
      if (!allow.has(id)) {
        onAgentChange?.(null)
      }
    }, [allowedAgentIdSet, onAgentChange, selectedAgent])
    const mentionAvatarAttachmentIds = useMemo(() => {
      return (Array.isArray(starshipAgents) ? (starshipAgents as AgentModel[]) : [])
        .map(a => (a as any)?.avatarAttachmentId as string | undefined)
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    }, [starshipAgents])
    const { data: mentionAvatarAttachments = [] } = useMessageAttachments(mentionAvatarAttachmentIds, starshipId)
    const mentionAvatarUrlById = useMemo(() => new Map(mentionAvatarAttachments.map(a => [a.id, a.previewUrl] as const)), [mentionAvatarAttachments])

    const agentsRef = useRef<AgentModel[]>([])
    const mentionAgentsSnapshotRef = useRef<AgentModel[] | null>(null)
    const membersRef = useRef<StarshipMemberListItem[]>([])
    const allowedMentionUserIdSetRef = useRef<Set<string> | null>(null)
    const allowedMentionAgentIdSetRef = useRef<Set<string> | null>(null)
    useEffect(() => {
      allowedMentionUserIdSetRef.current = allowedMentionUserIdSet
    }, [allowedMentionUserIdSet])
    useEffect(() => {
      allowedMentionAgentIdSetRef.current = allowedMentionAgentIdSet
    }, [allowedMentionAgentIdSet])
    useEffect(() => {
      const latest = Array.isArray(memberUsers) ? memberUsers : []
      if (latest.length > 0) membersRef.current = latest
    }, [memberUsers])
    useEffect(() => {
      const latest = (starshipAgents as AgentModel[]) || []
      if (Array.isArray(latest) && latest.length > 0) {
        agentsRef.current = latest
      }
    }, [starshipAgents])

    // Stream state must come from the (single) ship-layout provider; no fallbacks.
    const { sendMessage: sendMessageFn, isSending, isResponding, isAssistantStreaming, isAwaitingAssistant, isAwaitingToolResults, hasSnapshot, messages: streamMessages, hasMoreBefore: streamHasMoreBefore } = useConversationStreamContext()
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
    const canEditComposer = Boolean(!disabled && !isStreamingEffective && !sending)

    // Close the emoji picker whenever the composer becomes non-editable (streaming/disabled).
    useEffect(() => {
      if (!canEditComposer && emojiPickerOpen) setEmojiPickerOpen(false)
    }, [canEditComposer, emojiPickerOpen])

    // Context-window usage (mirrors server behavior: last N persisted messages + optional fold message).
    // IMPORTANT: this is **not** lifetime token usage; it's a proxy for how "full" the next-turn context is
    // given we cap history by message count on the server.
    // Derive from stream when available to avoid redundant /messages API call.
    const CONTEXT_MESSAGE_LIMIT = 30
    const streamSnapshotForContext = hasSnapshot && Array.isArray(streamMessages) ? { messages: streamMessages, hasMoreBefore: Boolean(streamHasMoreBefore) } : null
    const { data: ctxUsage } = useConversationContextUsage(conversationId ?? null, { limit: CONTEXT_MESSAGE_LIMIT, enabled: Boolean(conversationId), streamSnapshot: streamSnapshotForContext })
    const contextLimit = CONTEXT_MESSAGE_LIMIT
    const contextMessageCountRaw = Number(ctxUsage?.messageCount ?? 0)
    const contextMessageCount = Number.isFinite(contextMessageCountRaw) ? Math.max(0, Math.min(contextLimit, contextMessageCountRaw)) : 0
    const hasHistoryFold = Boolean(ctxUsage?.hasMoreBefore)
    const contextActive = Boolean(conversationId)

    const { data: conversationAgents = [] } = useConversationAgents(conversationId ?? null)
    const updateConversationState = useUpdateConversationState()

    // Pending ask-first tool approvals (durable, DB-backed)
    const { data: pendingToolApprovals = [] } = usePendingToolApprovals(conversationId ?? null, Boolean(conversationId))
    const [optimisticallyHiddenApprovalIds, setOptimisticallyHiddenApprovalIds] = useState<Set<string>>(new Set())
    const visiblePendingApprovals = useMemo(() => {
      const list = Array.isArray(pendingToolApprovals) ? pendingToolApprovals : []
      if (optimisticallyHiddenApprovalIds.size === 0) return list
      return list.filter(a => a && typeof a.id === 'string' && !optimisticallyHiddenApprovalIds.has(String(a.id)))
    }, [pendingToolApprovals, optimisticallyHiddenApprovalIds])
    // IMPORTANT: submitting must be tracked per approval id.
    // Otherwise, a second pending approval can show up while the first approve/deny request is still in-flight,
    // causing the new callout's buttons to be incorrectly disabled until a reload resets local state.
    const [submittingToolApprovalId, setSubmittingToolApprovalId] = useState<string | null>(null)

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

    // Thread routing rules:
    // - If the thread pane was opened from a non-assistant message, there may be no default agent selected.
    // - If a thread has 2+ linked agents, it becomes mention-only (no default agent fallback).
    const isThreadConversation = Boolean(conversation?.parentConversationId)
    const linkedAgentCount = Array.isArray(conversationAgents) ? conversationAgents.length : 0
    const isMentionOnlyThread = Boolean(isThreadConversation && linkedAgentCount >= 2)
    const isThreadDraft = Boolean(typeof newConversationParentConversationId === 'string' && newConversationParentConversationId.trim().length > 0)
    const isThreadContext = Boolean(isThreadConversation || isThreadDraft)

    // Credits gating: only require balance when the draft will actually trigger an agent.
    // (Server is authoritative; this is best-effort UX to avoid blocking human-only messages.)
    const draftHasAgentMention = useMemo(() => {
      const raw = String(message || '')
      if (!raw.trim()) return false
      // Preferred: structured agent mentions emitted by the composer.
      if (raw.includes('<@a:')) return true
      // Back-compat: plain-text @mentions. Mirror the server's mention token shapes loosely.
      const legacyText = raw.replace(/<@[^>\n]+>/g, ' ')
      const mentionRe = /@(?:"[^"\n]{1,100}"|\[[^\]\n]{1,100}\]|all|[a-z0-9._-]{1,100})/i
      return mentionRe.test(legacyText)
    }, [message])

    const requiresCreditsForDraft = useMemo(() => {
      // user↔user DMs are human-only (no agent run => no fixed message charge)
      if (resolvedDmTarget?.dmType === 'user_user') return false

      // Mention-only contexts: only charge when an agent is explicitly mentioned.
      if (isChannelContext || isMentionOnlyThread) return draftHasAgentMention

      // Normal conversations: charge when there's either a mention or a linked fallback agent.
      // (Mirrors the server: hasMention || linkedAgentCount > 0)
      if (draftHasAgentMention) return true
      const linkedCount = Array.isArray(conversationAgents) ? conversationAgents.length : 0
      return linkedCount > 0
    }, [conversationId, draftDirectMessageTarget, isChannelContext, isMentionOnlyThread, draftHasAgentMention, conversationAgents])

    // Collaborators can't access billing endpoints; avoid blocking chat on wallet data they can't fetch.
    const hasFunds = canManageBilling ? !requiresCreditsForDraft || balanceNum >= CREDITS_PER_MESSAGE : true
    const showLowBalanceWarning = Boolean(canManageBilling && conversationId && !isLoading && hasFunds && requiresCreditsForDraft && balanceNum <= LOW_WARNING_THRESHOLD)

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

    const refreshPendingToolApprovals = useCallback(
      async (cid: string) => {
        await queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.toolApprovalsPending(cid) })
      },
      [queryClient]
    )

    const approvePendingTool = useCallback(
      async (approval: any) => {
        const approvalId = String(approval?.id ?? '')
        if (!conversationId || !approvalId || submittingToolApprovalId === approvalId) return
        // Optimistically hide immediately for snappy UX; refetch will reconcile.
        setOptimisticallyHiddenApprovalIds(prev => new Set(prev).add(approvalId))
        setSubmittingToolApprovalId(approvalId)
        // Immediate UX feedback (do not wait for server-side tool execution).
        toast.success('Tool approved')
        try {
          await api.post(`/api/v1/conversations/${conversationId}/tool-approvals/${approvalId}/approve`)
          // IMPORTANT: do NOT await message invalidation here. The messages query is SSE-backed and may never "settle",
          // which would delay UX feedback like toasts until navigation/unmount.
          void refreshPendingToolApprovals(conversationId)
        } catch (e: any) {
          setOptimisticallyHiddenApprovalIds(prev => {
            const next = new Set(prev)
            next.delete(approvalId)
            return next
          })
          const msg = e?.message ? String(e.message) : 'Failed to approve tool'
          toast.error('Failed to approve tool', { description: msg })
        } finally {
          setSubmittingToolApprovalId(cur => (cur === approvalId ? null : cur))
        }
      },
      [conversationId, submittingToolApprovalId, queryClient, refreshPendingToolApprovals]
    )

    const alwaysAllowPendingTool = useCallback(
      async (approval: any) => {
        const approvalId = String(approval?.id ?? '')
        if (!conversationId || !approvalId || submittingToolApprovalId === approvalId) return
        const agentId = String(approval?.agentId || '')
        const toolSlug = String(approval?.toolSlug || (approval as any)?.toolSlug || '')
        if (!agentId || !toolSlug) {
          toast.error('Cannot always-allow', { description: 'Missing agentId or tool slug.' })
          return
        }

        // Optimistically hide immediately for snappy UX; refetch will reconcile.
        setOptimisticallyHiddenApprovalIds(prev => new Set(prev).add(approvalId))
        setSubmittingToolApprovalId(approvalId)
        // Immediate UX feedback (permission + execution may still fail; we handle errors separately).
        toast.success('Always allow enabled')
        try {
          // 1) Flip permission to allow so future calls don't require approval
          await api.put(`/api/v1/agents/${agentId}/tool-permissions`, { permissions: [{ toolSlug, permission: 'allow' }] })
          // 2) Approve this pending tool call
          await api.post(`/api/v1/conversations/${conversationId}/tool-approvals/${approvalId}/approve`)
          void refreshPendingToolApprovals(conversationId)
        } catch (e: any) {
          setOptimisticallyHiddenApprovalIds(prev => {
            const next = new Set(prev)
            next.delete(approvalId)
            return next
          })
          const msg = e?.message ? String(e.message) : 'Failed to set always-allow'
          toast.error('Failed to set always-allow', { description: msg })
        } finally {
          setSubmittingToolApprovalId(cur => (cur === approvalId ? null : cur))
        }
      },
      [conversationId, submittingToolApprovalId, queryClient, refreshPendingToolApprovals]
    )

    const denyPendingTool = useCallback(
      async (approval: any) => {
        const approvalId = String(approval?.id ?? '')
        if (!conversationId || !approvalId || submittingToolApprovalId === approvalId) return
        // Optimistically hide immediately for snappy UX; refetch will reconcile.
        setOptimisticallyHiddenApprovalIds(prev => new Set(prev).add(approvalId))
        setSubmittingToolApprovalId(approvalId)
        toast.message('Tool denied')
        try {
          await api.post(`/api/v1/conversations/${conversationId}/tool-approvals/${approvalId}/deny`)
          void refreshPendingToolApprovals(conversationId)
        } catch (e: any) {
          setOptimisticallyHiddenApprovalIds(prev => {
            const next = new Set(prev)
            next.delete(approvalId)
            return next
          })
          const msg = e?.message ? String(e.message) : 'Failed to deny tool'
          toast.error('Failed to deny tool', { description: msg })
        } finally {
          setSubmittingToolApprovalId(cur => (cur === approvalId ? null : cur))
        }
      },
      [conversationId, submittingToolApprovalId, queryClient, refreshPendingToolApprovals]
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
      const hasPendingAttachments = pendingFiles.length > 0
      // CRITICAL: Check if already blocked (synchronous ref check first)
      // Allow sending with ONLY file attachments (no text required).
      if ((!messageToSend && !hasPendingAttachments) || sending || disabled || isStreamingEffective || streamingRef.current) return

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

      const resolvedDmForSend: ResolvedDmTarget = (() => {
        // Draft DM (no conversation yet): we already know the target
        if (!conversationId && draftDirectMessageTarget) {
          if (draftDirectMessageTarget.dmType === 'user_agent') {
            const agentId = String(draftDirectMessageTarget.agentId || '').trim()
            return agentId ? ({ dmType: 'user_agent', agentId } as const) : null
          }
          if (draftDirectMessageTarget.dmType === 'user_user') {
            const peerUserId = String(draftDirectMessageTarget.peerUserId || '').trim()
            return peerUserId ? ({ dmType: 'user_user', peerUserId } as const) : null
          }
        }

        // Existing DM: resolve from starship DM list (usually already cached by sidebar)
        if (conversationId && !isChannelContext) {
          const cid = String(conversationId || '').trim()
          const list = (directMessagesData as any)?.directMessages
          const items = Array.isArray(list) ? (list as any[]) : []
          const match = items.find(it => String(it?.dm?.conversationId || '') === cid) || null
          const dm = match?.dm
          if (dm && typeof dm === 'object') {
            const dmType = String((dm as any).dmType || '')
            if (dmType === 'user_agent') {
              const agentId = String((dm as any).agentId || '').trim()
              return agentId ? ({ dmType: 'user_agent', agentId } as const) : null
            }
            if (dmType === 'user_user') {
              const peerFromList = String(match?.peerUser?.id || '').trim()
              const a = String((dm as any).userAId || '').trim()
              const b = String((dm as any).userBId || '').trim()
              const me = String(userId || '').trim()
              const derivedPeer = me && a && b ? (me === a ? b : me === b ? a : '') : ''
              const peerUserId = peerFromList || derivedPeer
              return peerUserId ? ({ dmType: 'user_user', peerUserId } as const) : null
            }
          }
        }

        return null
      })()

      const isUserUserDm = resolvedDmForSend?.dmType === 'user_user'

      const resolveAgentById = (id: string): AgentModel | null => {
        const aid = String(id || '').trim()
        if (!aid) return null
        const fromStarship = (Array.isArray(starshipAgentsForExecution) ? (starshipAgentsForExecution as AgentModel[]) : []).find(
          a => String(a?.id || '').trim() === aid
        ) ?? null
        if (fromStarship) return fromStarship
        const fromConv = (Array.isArray(conversationAgents) ? (conversationAgents as AgentModel[]) : []).find(a => String(a?.id || '').trim() === aid) ?? null
        return fromConv ?? null
      }

      // Resolve agent to send to:
      // - Default to the UI-selected agent for non-mention contexts (e.g. draft threads opened from an agent message).
      // - Then apply context rules (channel/DM/thread) and allow explicit leading @mention to override where applicable.
      let effectiveAgent: AgentModel | null | undefined = selectedAgent ?? null
      // Server-side validation requires non-empty content. For attachment-only sends, send a single space so the UI renders as attachments-only.
      let contentToSend = messageToSend || (hasPendingAttachments ? ' ' : '')
      if (isUserUserDm) {
        // user↔user DMs are human-only: never require or auto-pick an agent.
        effectiveAgent = null
      } else {
        // Channel context + mention-only threads: do not default; only run when an agent is explicitly mentioned.
        if (isChannelContext || isMentionOnlyThread) {
          effectiveAgent = null
        }

        // user↔agent DMs: lock to the DM target agent.
        const dmAgentId = resolvedDmForSend?.dmType === 'user_agent' ? String(resolvedDmForSend.agentId || '').trim() : ''
        const dmLockedAgent = dmAgentId ? resolveAgentById(dmAgentId) : null
        if (dmLockedAgent) {
          effectiveAgent = dmLockedAgent
        }

        // Threads (non-mention-only): if exactly 1 linked agent, allow it as a fallback.
        // NOTE: channel threads are mention-only (no fallback agent).
        if (!effectiveAgent && isThreadConversation && !isChannelContext && !isMentionOnlyThread && linkedAgentCount === 1) {
          const linked = Array.isArray(conversationAgents) ? (conversationAgents as AgentModel[]) : []
          effectiveAgent = linked[0] ?? null
        }

        // Prefer stable leading agent mention token (<@a:AGENT_ID>) where not locked.
        // NOTE: even in channel/mention-only contexts, this is how an agent is selected.
        // Prefer stable leading agent mention token (<@a:AGENT_ID>) for mention-only threads.
        if (!dmLockedAgent) {
          const tokenMatch = messageToSend.match(/^\s*<@a:([^>\s]+)>/)
          if (tokenMatch && starshipAgentsForExecution.length > 0) {
            const id = String(tokenMatch[1] || '').trim()
            const matched = id ? resolveAgentById(id) : null
            if (matched) {
              effectiveAgent = matched
            }
          } else {
            // Back-compat: plain-text leading @handle
            const mentionMatch = messageToSend.match(/^\s*@([A-Za-z0-9_-]+)/)
            if (mentionMatch && starshipAgentsForExecution.length > 0) {
              const handle = mentionMatch[1]
              const lower = handle.toLowerCase()
              const matched =
                (Array.isArray(starshipAgentsForExecution) ? (starshipAgentsForExecution as AgentModel[]) : []).find(
                  a => a.slug.toLowerCase() === lower || a.name.toLowerCase() === lower
                ) ?? null
              if (matched) {
                effectiveAgent = matched
                // Do NOT strip the leading mention; keep it in the message content
              }
            }
          }
        }
      }

      // Thread defaulting:
      // If we're in an existing thread conversation (not a draft) and the user didn't explicitly pick/mention an agent,
      // fall back to the first linked agent on the thread.
      //
      // Without this, opening a thread via URL/refresh (or from a non-assistant message) can yield `selectedAgent === null`,
      // which incorrectly blocks sending with "Select an agent" even though the thread already has linked agents.
      if (!effectiveAgent && !isUserUserDm && isThreadConversation && !isChannelContext && !isMentionOnlyThread && linkedAgentCount === 1) {
        const linked = Array.isArray(conversationAgents) ? conversationAgents : []
        if (linked.length > 0) {
          effectiveAgent = linked[0] ?? null
        }
      }

      // Human-only threads:
      // If a thread has *no* agent selected/mentioned and *no* linked agents,
      // allow the message to be persisted without triggering an agent.
      // (This covers "thread started from a user message" and other edge cases.)
      const isAttachmentOnlySend = Boolean(hasPendingAttachments && !messageToSend)
      const shouldPersistOnly = Boolean(isThreadContext && !isChannelContext && !isUserUserDm && !effectiveAgent && (!isMentionOnlyThread || isAttachmentOnlySend))

      // Best-effort routing preview:
      // Only pre-seed a local "turn_started" (typing/loader) when we expect the server to actually run an agent.
      // This prevents a brief "agent is typing" flash for messages that the server will persist without agent execution
      // (e.g. user mentions like <@u:...> in a default-agent thread).
      const routingPreview = (() => {
        if (isUserUserDm) return { willTriggerAgentBestEffort: false, hasUserMentionToken: false, hasAgentMention: false }
        if (shouldPersistOnly) return { willTriggerAgentBestEffort: false, hasUserMentionToken: false, hasAgentMention: false }

        const raw = String(messageToSend || '')
        const hasUserMentionToken = raw.includes('<@u:')
        // Mirror server mention behavior loosely:
        // - Structured agent mention tokens: <@a:AGENT_ID>
        // - Legacy @slug mentions (strip structured tokens first)
        const legacyText = raw.replace(/<@[^>\n]+>/g, ' ')
        const legacyMentionRe = /@(?:"[^"\n]{1,100}"|\[[^\]\n]{1,100}\]|all|[a-z0-9._-]{1,100})/i
        const hasAgentMention = raw.includes('<@a:') || legacyMentionRe.test(legacyText)

        // Mention-only contexts only run when at least one agent is mentioned.
        if (isChannelContext || isMentionOnlyThread) return { willTriggerAgentBestEffort: hasAgentMention, hasUserMentionToken, hasAgentMention }

        // If the message mentions any user(s) but no agent(s), do not run the default fallback agent.
        if (hasUserMentionToken && !hasAgentMention) return { willTriggerAgentBestEffort: false, hasUserMentionToken, hasAgentMention }

        // Otherwise: if we have an effective agent (explicit or fallback) or an agent mention, expect execution.
        return { willTriggerAgentBestEffort: Boolean(effectiveAgent || hasAgentMention), hasUserMentionToken, hasAgentMention }
      })()
      const willTriggerAgentBestEffort = routingPreview.willTriggerAgentBestEffort

      // Validation for agent and starship
      if (!effectiveAgent && !isChannelContext && !isUserUserDm && !shouldPersistOnly) {
        resetFlags()
        toast.error(isMentionOnlyThread ? 'Mention an agent' : 'Select an agent', {
          description: isMentionOnlyThread ? 'This thread has multiple agents. Start your message with @agent to choose who replies.' : 'Please select an agent to chat.',
        })
        return
      }

      // contentToSend validated: non-empty text OR attachment-only placeholder space.

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
          // Draft DM flow: create/resolve the DM conversation on first send.
          if (draftDirectMessageTarget && (draftDirectMessageTarget.dmType === 'user_agent' || draftDirectMessageTarget.dmType === 'user_user')) {
            const dmTitle = typeof draftDirectMessageTarget.title === 'string' && draftDirectMessageTarget.title.trim().length > 0 ? draftDirectMessageTarget.title.trim() : undefined

            const created = await createDirectMessage.mutateAsync({
              starshipId,
              ...(draftDirectMessageTarget.dmType === 'user_agent'
                ? { agentId: String(draftDirectMessageTarget.agentId || '').trim() }
                : { peerUserId: String(draftDirectMessageTarget.peerUserId || '').trim() }),
              ...(dmTitle ? { title: dmTitle } : null),
            })

            currentConversationId = created?.conversationId ? String(created.conversationId) : null
            if (!currentConversationId) {
              resetFlags()
              toast.error('Failed to start direct message', { description: 'Please try again.' })
              return
            }
            sendConversationId = currentConversationId
            createdNewConversation = true
          } else {
            const isThreadCreate = typeof newConversationParentConversationId === 'string' && newConversationParentConversationId.trim().length > 0

            // Starter conversations must be agent-backed (channels are created via the Channels UI).
            // EXCEPTION: child conversations (threads) may be created agent-less for human-only threads.
            if (!effectiveAgent && !isThreadCreate) {
              resetFlags()
              toast.error('Select an agent', { description: 'Please select an agent to chat.' })
              return
            }
            const title = (() => {
              const override = typeof newConversationTitleOverride === 'string' ? newConversationTitleOverride.trim() : ''
              if (override) return override
              return isThreadCreate ? 'New thread' : `Chat with ${formatAgentDisplayName(effectiveAgent!)}`
            })()
            const newConversation = await createConversation.mutateAsync(
              isThreadCreate
                ? effectiveAgent
                  ? {
                      title,
                      starshipId: starshipId,
                      parentConversationId: newConversationParentConversationId!.trim(),
                      // IMPORTANT: threads are not channels; server requires at least one linked agent for agent-triggering messages.
                      agentSlug: effectiveAgent.slug,
                    }
                  : {
                      title,
                      starshipId: starshipId,
                      parentConversationId: newConversationParentConversationId!.trim(),
                    }
                : {
                    title,
                    starshipId: starshipId,
                    agentSlug: effectiveAgent!.slug,
                  }
            )
            currentConversationId = newConversation.id
            sendConversationId = currentConversationId
            createdNewConversation = true

            // If this was a draft-thread create, persist the "linked message" now (only on first reply).
            try {
              const parentId = typeof linkMessageToNewConversation?.parentConversationId === 'string' ? linkMessageToNewConversation.parentConversationId.trim() : ''
              const msgId = typeof linkMessageToNewConversation?.messageId === 'string' ? linkMessageToNewConversation.messageId.trim() : ''
              if (parentId && msgId) {
                await linkMessageToConversation.mutateAsync({ messageId: msgId, linkedConversationId: currentConversationId, conversationId: parentId })
              }
            } catch {}

            // Thread context is now persisted server-side when linking the parent message to the new thread
            // (via linkedConversationId). No hidden system seed message is required.

            // Apply pending web browsing preference if enabled
            await applyPendingWebBrowsing(currentConversationId)
          }
        }
        sendConversationId = currentConversationId!
        // Ensure local ref is updated immediately for stop button usability
        lastConversationIdRef.current = currentConversationId!

        // CRITICAL: pre-seed the streamed cache with a temp user message + local turn_started
        // BEFORE uploads / sendMessageFn() so the stream-derived responder state does not
        // briefly drop to idle during the /conversations -> /conversations/:id route change.
        if (!shouldPersistOnly) {
          try {
            const now = new Date().toISOString()
            const authedUserId = typeof userId === 'string' ? userId.trim() : ''
            const authedUserName = typeof userName === 'string' ? userName.trim() : typeof userEmail === 'string' ? userEmail.trim() : ''
            const authedUserAvatar = typeof userAvatar === 'string' ? userAvatar.trim() : ''
            const clientMessageId = generateId()
            const tempUser: any = {
              id: `temp-user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              clientMessageId,
              role: 'user',
              content: contentToSend,
              createdAt: now,
              updatedAt: now,
              messageType: 'user_input',
              ...(authedUserId ? { userId: authedUserId } : null),
              ...(authedUserName ? { userName: authedUserName } : null),
              ...(authedUserAvatar ? { userAvatar: authedUserAvatar } : null),
              ...(effectiveAgent?.id ? { agentId: effectiveAgent.id } : null),
            }
            // Seed streamedQuery chunks; sendMessageMutation.onMutate will detect and avoid duplicating this.
            queryClient.setQueryData(['conversations', 'detail', currentConversationId!, 'messages'], (old: any[] | undefined) => {
              const next = Array.isArray(old) ? old.slice() : []
              const last = next.length > 0 ? next[next.length - 1] : null
              const prev = next.length > 1 ? next[next.length - 2] : null
              const already =
                // Case A: seeded append + turn_started
                (last?.type === 'turn_started' &&
                  last?.payload?.local === true &&
                  prev?.type === 'append' &&
                  prev?.message?.role === 'user' &&
                  typeof prev?.message?.id === 'string' &&
                  String(prev.message.id).startsWith('temp-user-') &&
                  String(prev?.message?.content ?? '') === String(contentToSend)) ||
                // Case B: seeded append only (no local turn_started)
                (last?.type === 'append' &&
                  last?.message?.role === 'user' &&
                  typeof last?.message?.id === 'string' &&
                  String(last.message.id).startsWith('temp-user-') &&
                  String(last?.message?.content ?? '') === String(contentToSend))
              if (already) return next
              next.push({ type: 'append', message: tempUser })
              if (willTriggerAgentBestEffort) {
                next.push({ type: 'turn_started', payload: { local: true, at: Date.now() } })
              }
              return next
            })
          } catch {}

          // IMPORTANT: only after we seed the stream cache do we trigger the route transition.
          if (createdNewConversation) {
            onConversationStart?.(currentConversationId!)
          }
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

        // Human-only thread message: persist without invoking ConversationService/agent execution.
        if (shouldPersistOnly) {
          try {
            const resp = await api.post('/api/v1/messages', {
              role: 'user',
              content: contentToSend,
              starshipId: starshipId,
              conversationId: currentConversationId!,
              messageType: 'user_input',
              ...(attachmentIdsToSend.length > 0 ? { attachmentIds: attachmentIdsToSend } : null),
            })

            const created = (resp as any)?.data?.data ?? (resp as any)?.data ?? null
            if (created?.id) {
              // Append to the streamedQuery chunks as a legacy local chunk (hook reduces this into messages).
              queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(currentConversationId!), (old: any) => {
                const prev = Array.isArray(old) ? old.slice() : []
                prev.push({ type: 'append', message: created })
                return prev
              })
            } else {
              // Fallback: refetch messages if response shape is unexpected.
              void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(currentConversationId!) })
            }

            // If we created the thread conversation just now, navigate after we have the message cached.
            if (createdNewConversation) {
              onConversationStart?.(currentConversationId!)
            }
          } catch (error) {
            toast.error('Failed to send message', { description: (error as any)?.message || 'Please try again.' })
            setMessage(messageToSend)
          } finally {
            setSending(false)
            streamingRef.current = false
            setPendingFiles([])
            setUploadedAttachmentIds([])
          }
          return
        }

        // Fire-and-forget streaming; streaming lifecycle manages completion/cleanup
        void sendMessageFn({
          conversationId: currentConversationId!,
          ...(effectiveAgent?.id ? { agentId: effectiveAgent.id } : null),
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
      draftDirectMessageTarget,
      message,
      pendingFiles,
      sending,
      disabled,
      isStreamingEffective,
      conversation,
      conversationAgents,
      isThreadContext,
      isMentionOnlyThread,
      selectedAgent,
      isChannelContext,
      userId,
      conversationId,
      createConversation,
      createDirectMessage,
      linkMessageToConversation,
      linkMessageToNewConversation,
      newConversationParentConversationId,
      newConversationTitleOverride,
      onConversationStart,
      onMessageSent,
      sendMessageFn,
      starshipId,
      onAgentChange,
      starshipAgentsForExecution,
      uploadFile,
      queryClient,
      applyPendingWebBrowsing,
    ])

    // Keep a stable ref for TipTap's Enter key handler.
    useEffect(() => {
      submitRef.current = () => {
        void handleSubmit()
      }
    }, [handleSubmit])

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
            const isThreadCreate = typeof newConversationParentConversationId === 'string' && newConversationParentConversationId.trim().length > 0
            const title = (() => {
              const override = typeof newConversationTitleOverride === 'string' ? newConversationTitleOverride.trim() : ''
              if (override) return override
              return isThreadCreate ? 'New thread' : `Chat with ${formatAgentDisplayName(selectedAgent)}`
            })()
            const newConversation = await createConversation.mutateAsync(
              isThreadCreate
                ? {
                    title,
                    starshipId: starshipId,
                    parentConversationId: newConversationParentConversationId!.trim(),
                    // IMPORTANT: threads are not channels; server requires at least one linked agent.
                    agentSlug: selectedAgent.slug,
                  }
                : {
                    title,
                    starshipId: starshipId,
                    agentSlug: selectedAgent.slug,
                  }
            )
            currentConversationId = newConversation.id
            sendConversationId = currentConversationId
            createdNewConversation = true

            // If this was a draft-thread create, persist the "linked message" now (only on first reply).
            try {
              const parentId = typeof linkMessageToNewConversation?.parentConversationId === 'string' ? linkMessageToNewConversation.parentConversationId.trim() : ''
              const msgId = typeof linkMessageToNewConversation?.messageId === 'string' ? linkMessageToNewConversation.messageId.trim() : ''
              if (parentId && msgId) {
                await linkMessageToConversation.mutateAsync({ messageId: msgId, linkedConversationId: currentConversationId, conversationId: parentId })
              }
            } catch {}

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
      [
        sending,
        disabled,
        isStreamingEffective,
        selectedAgent,
        userId,
        conversationId,
        createConversation,
        linkMessageToConversation,
        linkMessageToNewConversation,
        newConversationParentConversationId,
        newConversationTitleOverride,
        onConversationStart,
        onMessageSent,
        sendMessageFn,
        starshipId,
        applyPendingWebBrowsing,
      ]
    )

    const agentLabelForUI = useCallback((a: AgentModel | null): string | null => {
      if (!a) return null
      const n = typeof a.name === 'string' ? a.name.trim() : ''
      if (n) return n
      const fallback = formatAgentDisplayName(a as any)
      return (typeof fallback === 'string' ? fallback.trim() : '') || null
    }, [])

    const contextAgentForUI: AgentModel | null = useMemo(() => {
      // Channels are mention-driven; never imply a default agent in the UI.
      if (isChannelContext) return null

      // DMs: lock UI hints to the DM target agent when applicable.
      if (resolvedDmTarget?.dmType === 'user_agent') {
        const id = resolvedDmTarget.agentId
        const fromStarship = (Array.isArray(starshipAgentsForExecution) ? (starshipAgentsForExecution as AgentModel[]) : []).find(
          a => String(a?.id || '').trim() === id
        ) ?? null
        if (fromStarship) return fromStarship
        const fromConv = (Array.isArray(conversationAgents) ? (conversationAgents as AgentModel[]) : []).find(a => String(a?.id || '').trim() === id) ?? null
        return fromConv ?? null
      }

      // Threads: if exactly 1 linked agent, we can be contextual. Otherwise mention-only or human-only.
      if (isThreadContext && !isMentionOnlyThread && linkedAgentCount === 1) {
        const a0 = (Array.isArray(conversationAgents) ? (conversationAgents as AgentModel[]) : [])[0] ?? null
        return a0 ?? null
      }

      return null
    }, [conversationAgents, isChannelContext, isMentionOnlyThread, isThreadContext, linkedAgentCount, resolvedDmTarget, starshipAgentsForExecution])

    const getPlaceholder = () => {
      const label = agentLabelForUI(contextAgentForUI)
      if (isStreamingEffective) return label ? `${label} is responding...` : 'AI is responding...'
      if (sending) return label ? `${label} is thinking...` : 'Thinking...'

      // Channel roots: "message the channel"
      if (isChannelRootConversation) return 'Message this channel (mention agents with @)'
      // Channel threads: mention-only behavior, but still allow human chatter without an agent trigger.
      if (isChannelContext) return 'Reply (mention an agent with @)…'
      if (resolvedDmTarget?.dmType === 'user_agent') return label ? `Message ${label}…` : 'Write a message…'
      if (resolvedDmTarget?.dmType === 'user_user') return 'Write a message…'
      if (isMentionOnlyThread) return 'Reply (mention an agent with @)…'
      if (isThreadContext && label) return `Reply to ${label}…`
      return 'Write a message…'
    }

    // Track if there's actual content beyond just the mention and space
    const [hasActualContent, setHasActualContent] = useState(false)

    // Require balance; server also enforces funds.
    const hasLeadingMentionToken = (() => {
      const t = String(message || '').trim()
      return t.startsWith('<@a:') || t.startsWith('@')
    })()
    const hasTargetAgent = isChannelContext
      ? true
      : resolvedDmTarget?.dmType === 'user_user'
        ? true
        : resolvedDmTarget?.dmType === 'user_agent'
          ? true
          : isMentionOnlyThread
            ? hasLeadingMentionToken
            : hasLeadingMentionToken || (isThreadConversation && linkedAgentCount === 1) || (isThreadContext && linkedAgentCount === 0)
    const hasPendingAttachments = pendingFiles.length > 0
    const hasSendableContent = hasActualContent || hasPendingAttachments
    // Preserve existing agent-target gating for text, but allow attachment-only sends without text.
    const meetsTargetGate = hasActualContent ? hasTargetAgent : hasPendingAttachments
    const canSend = hasSendableContent && meetsTargetGate && !disabled && !sending && !isStreamingEffective && hasFunds

    // Mobile UX: Discord-like "focus mode" (secondary actions fade back once typing/focused).
    const isMobileComposerEngaged = Boolean((isEditorFocused || hasActualContent) && !disabled && !isStreamingEffective)

    // TipTap editor with Mention extension to treat mentions as atomic units

    // Presence (online/offline) for mention suggestion avatars
    const { isUserOnline } = useStarshipPresence(starshipId, Boolean(starshipId))

    const MentionList = ({
      items,
      command,
      anchorRect,
      active,
      onHover,
    }: {
      items: Array<{ id: string; label: string; kind?: 'agent' | 'user'; agent?: AgentModel; user?: StarshipMemberListItem; inRoom?: boolean }>
      command: (item: { id: string; label: string; kind?: 'agent' | 'user'; agent?: AgentModel; user?: StarshipMemberListItem; inRoom?: boolean }) => void
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
      const hasRoomSegregation = (Array.isArray(items) ? items : []).some(i => (i as any)?.inRoom === false)
      const firstNotInRoomIdx = hasRoomSegregation ? (Array.isArray(items) ? items : []).findIndex(i => (i as any)?.inRoom === false) : -1
      return (
        <div
          style={style}
          className="w-[min(420px,calc(100vw-40px))] max-h-64 overflow-auto rounded-lg border border-border/40 bg-popover/95 backdrop-blur-md shadow-frosted-lg p-1"
          role="listbox"
          aria-label="Mention suggestions"
        >
          {(Array.isArray(items) ? items : []).map((item, idx: number) => {
            const showNotInRoomHeader = hasRoomSegregation && firstNotInRoomIdx >= 0 && idx === firstNotInRoomIdx
            const showInRoomHeader = hasRoomSegregation && idx === 0
            const kind = (item as any)?.kind === 'user' ? 'user' : 'agent'
            const agent = kind === 'agent' ? ((item as any).agent as AgentModel | undefined) : undefined
            const user = kind === 'user' ? ((item as any).user as StarshipMemberListItem | undefined) : undefined
            const label = String((item as any)?.label || agent?.name || user?.displayName || user?.email || '').trim()
            const key = `${kind}:${String((item as any)?.id || '')}`
            const userIdForPresence = kind === 'user' ? String((user as any)?.userId || (item as any)?.id || '').trim() : ''
            const online = kind === 'user' ? isUserOnline(userIdForPresence) : true
            const fallback = (label || '?').trim().slice(0, 1).toUpperCase()
            const inRoom = (item as any)?.inRoom !== false
            return (
              <div key={key}>
                {showInRoomHeader ? (
                  <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">In this room</div>
                ) : null}
                {showNotInRoomHeader ? (
                  <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Not in this room</div>
                ) : null}
                <button
                  id={`mention-option-${key}`}
                  ref={idx === active ? activeItemRef : null}
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-selected={idx === active}
                  className={cn(
                    // Match navbar item styling: muted by default, foreground on hover/active.
                    'group relative rounded-lg flex items-center border w-full h-8 cursor-pointer text-sm px-2 gap-2 transition-colors focus-visible-ring',
                    idx === active ? 'text-foreground bg-muted border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
                  )}
                  onMouseEnter={() => onHover(idx)}
                  onMouseDown={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    command(item)
                  }}
                  onPointerDown={e => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  <div className="relative">
                    <Avatar className={cn('h-5 w-5 rounded-full ring-1 ring-border/40')}>
                      {kind === 'user' ? (
                        <>
                          {user?.avatar ? (
                            <AvatarImage src={user.avatar} alt={label || 'User'} referrerPolicy="no-referrer" className="object-cover rounded-full" />
                          ) : null}
                          <AvatarFallback className="rounded-full bg-primary/10 text-primary text-[10px] font-semibold">{fallback}</AvatarFallback>
                        </>
                      ) : (
                        <AgentAvatar
                          seed={label || 'Mention'}
                          imageUrl={agent ? mentionAvatarUrlById.get((agent as any).avatarAttachmentId) : undefined}
                          size={20}
                          rounded
                        />
                      )}
                    </Avatar>
                    <PresenceIndicator kind={kind === 'user' ? (online ? 'online' : 'offline') : 'online'} active={true} size="xs" />
                  </div>
                  <span className="min-w-0 truncate font-medium flex-1">{label}</span>
                  {!inRoom ? (
                    <span className="ml-2 text-[11px] font-medium text-muted-foreground border border-border/40 rounded px-1.5 py-0.5">Add</span>
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>
      )
    }

    const mentionSuggestion = {
      char: '@',
      allowSpaces: false,
      items: ({ query }: any) => {
        const q = String(query || '')
          .toLowerCase()
          .trim()
        const me = String(userId || '').trim()
        const dmAllowed = dmMentionAllowedRef.current
        const dmKind = dmAllowed?.kind ?? null
        const dmId = typeof dmAllowed?.id === 'string' ? dmAllowed.id : null
        const restrictToSingleDmPeer = Boolean(dmKind && dmId)
        const mentionAllowUsers = allowedMentionUserIdSetRef.current
        const mentionAllowAgents = allowedMentionAgentIdSetRef.current
        const agents = (mentionAgentsSnapshotRef.current && mentionAgentsSnapshotRef.current.length > 0 ? mentionAgentsSnapshotRef.current : agentsRef.current) || []
        const users = membersRef.current || []
        const hasRoomSegregation = Boolean(roomConversationId && (mentionAllowUsers || mentionAllowAgents))

        const matchesQuery = (haystacks: string[]) => {
          if (!q) return true
          return haystacks.some(h => h.includes(q))
        }
        // Prefer "starts with" matches first, then "contains".
        const matchRank = (haystacks: string[]) => {
          if (!q) return 0
          if (haystacks.some(h => h.startsWith(q))) return 0
          if (haystacks.some(h => h.includes(q))) return 1
          return 2
        }

        const items: Array<{
          id: string
          label: string
          kind: 'agent' | 'user'
          agent?: AgentModel
          user?: StarshipMemberListItem
          inRoom?: boolean
          _kindRank: number
          _matchRank: number
          _roomRank: number
        }> = []

        // Humans first
        for (const u of Array.isArray(users) ? users : []) {
          if (restrictToSingleDmPeer) {
            if (dmKind !== 'user') continue
            const uid = String((u as any)?.userId || '').trim()
            if (!uid || uid !== String(dmId)) continue
          }
          const uid = String((u as any)?.userId || '').trim()
          if (!uid) continue
          // Self-mentions are not allowed (do not even suggest them).
          if (me && uid === me) continue

          const label = String(u.displayName || u.email || 'User').trim() || 'User'
          const haystacks = [label.toLowerCase(), String(u.email || '').toLowerCase()]
          if (!matchesQuery(haystacks)) continue
          const inRoom = hasRoomSegregation && mentionAllowUsers ? mentionAllowUsers.has(uid) : true
          items.push({
            id: uid,
            label,
            kind: 'user',
            user: u,
            inRoom,
            _kindRank: 0,
            _matchRank: matchRank(haystacks),
            _roomRank: inRoom ? 0 : 1,
          })
        }

        // Then agents
        for (const a of Array.isArray(agents) ? agents : []) {
          if (restrictToSingleDmPeer) {
            if (dmKind !== 'agent') continue
            if (String(a?.id || '') !== String(dmId)) continue
          }
          const id = String((a as any)?.id || '').trim()
          if (!id) continue
          const label = String(formatAgentDisplayName(a as any) || a.name || a.slug || 'Agent').trim() || 'Agent'
          const haystacks = [String(a.name || '').toLowerCase(), String(a.slug || '').toLowerCase(), label.toLowerCase()]
          if (!matchesQuery(haystacks)) continue
          const inRoom = hasRoomSegregation && mentionAllowAgents ? mentionAllowAgents.has(id) : true
          items.push({
            id,
            label,
            kind: 'agent',
            agent: a as any,
            inRoom,
            _kindRank: 1,
            _matchRank: matchRank(haystacks),
            _roomRank: inRoom ? 0 : 1,
          })
        }

        items.sort((a, b) => {
          if (a._roomRank !== b._roomRank) return a._roomRank - b._roomRank // in-room first
          if (a._kindRank !== b._kindRank) return a._kindRank - b._kindRank // users first
          if (a._matchRank !== b._matchRank) return a._matchRank - b._matchRank // starts-with first
          return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
        })

        return items
          .filter(i => Boolean(i.id))
          .slice(0, 10)
          .map(i => {
            const { _kindRank: _kr, _matchRank: _mr, _roomRank: _rr, ...rest } = i
            return rest
          })
      },
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
          const items = (lastProps.items as Array<{ id: string; label: string; kind?: 'agent' | 'user'; agent?: AgentModel; user?: StarshipMemberListItem }>) || []
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
                const cmd = (component as any)?.props?.command
                if (typeof cmd === 'function') {
                  cmd(choice)
                } else {
                  // Fallback: legacy behavior (no invite-on-mention)
                  lastProps.command(choice)
                  try {
                    cleanupTrailingQueryAfterMention(lastProps.editor, lastQuery)
                  } catch {}
                  try {
                    const kind = (choice as any)?.kind
                    const id = (choice as any)?.id
                    const label = (choice as any)?.label
                    if (kind === 'agent') {
                      let agent = (agentsRef.current || []).find(a => a.id === id) || null
                      if (!agent && label) {
                        const lower = String(label).toLowerCase()
                        agent = (agentsRef.current || []).find(a => a.name.toLowerCase() === lower || a.slug.toLowerCase() === lower) || null
                      }
                      if (agent) onAgentChange?.(agent)
                    }
                  } catch {}
                }
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
                items: (props.items as any[]).filter(Boolean),
                active,
                onHover: (i: number) => {
                  active = i
                  component?.updateProps({ ...component.props, active })
                },
                command: (item: any) => {
                  const realItem = (props.items as any[]).find(i => i.id === item?.id && i.kind === item?.kind) || item
                  const inRoom = realItem?.inRoom !== false

                  // Slack-like: if target isn't in the room yet, prompt to add them first.
                  if (!inRoom && roomConversationId) {
                    const kind = realItem?.kind === 'user' ? 'user' : 'agent'
                    const id = String(realItem?.id || '').trim()
                    const label = String(realItem?.label || '').trim() || (kind === 'user' ? 'User' : 'Agent')
                    if (!id) return

                    // Close the menu immediately to avoid duplicate actions while we confirm/execute.
                    try {
                      props.exit?.()
                    } catch {}

                    void (async () => {
                      const ok = typeof window !== 'undefined' ? window.confirm(`${label} isn’t in this room yet. Add them to the room?`) : false
                      if (!ok) return
                      try {
                        if (kind === 'user') {
                          await api.post(`/api/v1/rooms/${encodeURIComponent(String(roomConversationId))}/members`, { userId: id, role: 'member' })
                        } else {
                          await api.post(`/api/v1/rooms/${encodeURIComponent(String(roomConversationId))}/agents`, { agentId: id })
                        }

                        // Best-effort cache refresh so subsequent UI reflects membership.
                        try {
                          await queryClient.invalidateQueries({ queryKey: ['rooms', 'detail', String(roomConversationId), 'participants'] as const })
                        } catch {}

                        // Now insert the mention token.
                        props.command({ ...realItem, inRoom: true })
                        try {
                          cleanupTrailingQueryAfterMention(props.editor, lastQuery)
                        } catch {}

                        // Update selected agent (agents only) after allowlisting.
                        try {
                          if (kind === 'agent') {
                            const selected = (agentsRef.current || []).find(a => a.id === id) || null
                            if (selected && onAgentChange) onAgentChange(selected)
                          }
                        } catch {}
                      } catch (e) {
                        toast.error('Failed to add to room', { description: getSafeErrorMessage(e) })
                      }
                    })()
                    return
                  }

                  props.command(realItem)
                  try {
                    cleanupTrailingQueryAfterMention(props.editor, lastQuery)
                  } catch {}
                  // Then update selected agent (agents only)
                  try {
                    if (realItem?.kind === 'agent') {
                      const selected = (agentsRef.current || []).find(a => a.id === realItem.id) || null
                      if (selected && onAgentChange) onAgentChange(selected)
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

            const newItems = (props.items as any[]).filter(Boolean)

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
            const items = props.items as Array<{ id: string; label: string; kind?: 'agent' | 'user'; agent?: AgentModel; user?: StarshipMemberListItem }>
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
                  const cmd = (component as any)?.props?.command
                  if (typeof cmd === 'function') {
                    cmd(choice)
                  } else {
                    // Fallback: legacy behavior (no invite-on-mention)
                    props.command(choice)
                    try {
                      cleanupTrailingQueryAfterMention(props.editor, lastQuery)
                    } catch {}
                    try {
                      const kind = (choice as any)?.kind
                      const id = (choice as any)?.id
                      const label = (choice as any)?.label
                      if (kind === 'agent') {
                        let agent = (agentsRef.current || []).find(a => a.id === id) || null
                        if (!agent && label) {
                          const lower = String(label).toLowerCase()
                          agent = (agentsRef.current || []).find(a => a.name.toLowerCase() === lower || a.slug.toLowerCase() === lower) || null
                        }
                        if (agent) onAgentChange?.(agent)
                      }
                    } catch {}
                  }
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
      const kind = node?.attrs?.kind
      const agent = kind === 'agent' ? (agentsRef.current || []).find(a => a.id === id) : null
      const user = kind === 'user' ? (membersRef.current || []).find(u => String((u as any).userId || '') === String(id || '')) : null
      const display = agent?.name || user?.displayName || user?.email || label || id || ''
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
              {kind === 'user' && user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt={display} className="h-4 w-4 object-cover" />
              ) : (
                <AgentAvatar seed={display} imageUrl={agent ? mentionAvatarUrlById.get((agent as any).avatarAttachmentId) : undefined} size={16} />
              )}
            </span>
            <span className="font-medium text-sm">@{display}</span>
          </span>
        </NodeViewWrapper>
      )
    }

    // Removed global capture listener to avoid recursive event dispatch; rely on element-level handlers

    const placeholderText = useMemo(() => getPlaceholder(), [getPlaceholder])
    const placeholderRef = useRef<string>(placeholderText)
    useEffect(() => {
      placeholderRef.current = placeholderText
    }, [placeholderText])

    // Extract example prompts from the context agent if present
    const examplePrompts: string[] = useMemo(() => {
      const a: any = contextAgentForUI as any
      const list = a?.previewPrompts || a?.examplePrompts || a?.examples || a?.state?.examplePrompts || []
      return Array.isArray(list) ? (list as string[]).filter(Boolean) : []
    }, [contextAgentForUI])

    // Merge with server-fetched agent/template preview prompts if not present
    const [templatePrompts, setTemplatePrompts] = useState<string[]>([])
    useEffect(() => {
      let aborted = false
      setTemplatePrompts([])
      const a: any = contextAgentForUI as any
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
    }, [contextAgentForUI, examplePrompts])

    const inlinePrompts: string[] = useMemo(() => {
      if (examplePrompts.length > 0) return examplePrompts
      if (templatePrompts.length > 0) return templatePrompts
      // Final fallback to ensure animated placeholder renders even if backend has no prompts yet
      return ['Design an agent that researches topics using Wikipedia', 'Create a customer support agent that can help users with common questions', 'Plan a workflow for new customers']
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
          addAttributes() {
            return {
              ...(((this as any).parent?.() as Record<string, unknown>) || {}),
              kind: {
                default: 'agent',
              },
            }
          },
          addNodeView() {
            return ReactNodeViewRenderer(MentionNodeView as any)
          },
        }).configure({
          // Mentions behave like normal atomic nodes (user can delete them).
          deleteTriggerWithBackspace: true,
          // Serialize mentions into stable tokens so `editor.getText()` preserves IDs:
          // - users: <@u:USER_ID>
          // - agents: <@a:AGENT_ID>
          renderText: ({ options, node }: any) => {
            const id = node?.attrs?.id
            const kind = node?.attrs?.kind
            if (kind === 'user') return `<@u:${String(id || '')}>`
            return `<@a:${String(id || '')}>`
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
            // Match the chat transcript's default message text size.
            'text-sm leading-relaxed',
            // Prevent leading mention pills (ring/shadow) from clipping on the left edge.
            'pl-1 pr-0.5',
            // Minimal mode should still feel comfortable (not cramped).
            // NOTE: Do NOT set max-height here; the scroll container lives outside the ProseMirror node.
            // If ProseMirror has a max-height, overflowing content can be clipped without increasing the
            // parent's scrollHeight, making long inputs appear "non-scrollable".
            minimal ? 'min-h-[36px]' : isStarter ? 'min-h-[96px]' : 'min-h-[64px]',
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
            submitRef.current?.()
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

    const handleEmojiSelect = useCallback(
      (emojiRaw: string) => {
        const emoji = String(emojiRaw || '').trim()
        if (!emoji) return
        try {
          // Requirement: append to the end of whatever is currently in the composer.
          tiptap?.chain().focus('end').insertContent(emoji).run()
        } catch {}
        // Close after selection for a smooth UX.
        setEmojiPickerOpen(false)
      },
      [tiptap]
    )

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
      // On small-screen devices, avoid auto-focusing the composer (it triggers the on-screen keyboard).
      const isSmallScreen = () => (typeof window !== 'undefined' ? window.innerWidth < 768 : false)
      const shouldFocus = () => {
        if (disabled || isStreamingEffective || sending) return false
        if (isSmallScreen()) return false
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

    // Calculate context-window usage percentage for progress indicator
    const contextUsagePercent = contextLimit > 0 ? Math.min(100, (contextMessageCount / contextLimit) * 100) : 0
    const contextWarningLevel = contextUsagePercent >= 90 ? 'critical' : contextUsagePercent >= 75 ? 'warning' : 'normal'

    return (
      <div className="relative opacity-100">
        <PlaceholderStyles />
        {/* Context Window Indicator - Show when there is a conversation and the window is filling */}
        {contextActive && contextUsagePercent > 50 && !minimal && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/40">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <Icon
                  name="database"
                  className={cn('h-3.5 w-3.5', contextWarningLevel === 'critical' ? 'text-red-500' : contextWarningLevel === 'warning' ? 'text-orange-500' : 'text-muted-foreground')}
                />
                <span className="text-xs font-medium text-foreground">Context Window</span>
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
                {contextMessageCount.toLocaleString()} / {contextLimit.toLocaleString()} messages{hasHistoryFold ? ' + summary' : ''}
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
                {contextWarningLevel === 'critical'
                  ? 'Context window is full. Older history will be summarized for the next turn.'
                  : 'Approaching the context window limit. Older history may be summarized soon.'}
              </p>
            )}
          </div>
        )}

        {/* Pending tool approval callout (ask-first tools) */}
        {conversationId &&
          Array.isArray(visiblePendingApprovals) &&
          visiblePendingApprovals.length > 0 &&
          visiblePendingApprovals.map((a: any) => {
            const id = String(a?.id ?? '')
            if (!id) return null
            return (
              <ToolApprovalCallout
                key={id}
                approval={{
                  id,
                  agentName: String(a?.agentName || ''),
                  toolSlug: String(a?.toolSlug || ''),
                  toolName: String(a?.toolName || ''),
                  argsJson: (a as any)?.argsJson ?? {},
                }}
                isSubmitting={submittingToolApprovalId === id}
                onApproveOnce={() => approvePendingTool(a)}
                onAlwaysAllow={() => alwaysAllowPendingTool(a)}
                onDeny={() => denyPendingTool(a)}
              />
            )
          })}
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
                  You’re running low on credits. Each agent-triggering message costs {CREDITS_PER_MESSAGE} credits—add more to avoid interruptions.
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
        {canManageBilling && requiresCreditsForDraft && !hasFunds && !isLoading && conversationId && (
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
                <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                  You need at least {CREDITS_PER_MESSAGE} credits to send an agent-triggering message. Please add credits to keep chatting.
                </p>
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
        <div
          className={cn(
            // Mobile: edge-to-edge + less "cardy" (more native-feeling bar).
            // Desktop: keep the rounded composer card.
            'relative transition-all overflow-visible bg-card shadow-sm',
            // Mobile: only a top border (flush to screen edges). Desktop: full border + rounded card.
            'border-t border-border/40 border-x-0 border-b-0 sm:border sm:border-border/40 sm:rounded-2xl rounded-none',
            disabled && 'opacity-50'
          )}
        >
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
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.html,.css,.js,.ts,.py,.java,.cpp,.c,.go,.rs,.rb,.php,.swift"
            onChange={handleFileSelect}
            className="hidden"
          />

          {isExpandedStarterLayout ? (
            <div className="px-3 py-2.5">
              {/* Row 1: Editor gets full width */}
              <div
                className={cn('w-full min-w-0 relative z-10')}
                onPaste={handlePaste}
                style={{
                  paddingBottom: attachmentHeight > 0 ? `${attachmentHeight}px` : undefined,
                }}
              >
                <div
                  className={cn('overflow-y-auto overflow-x-visible scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent', 'max-h-[300px]')}
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  <EditorContent editor={tiptap} />
                </div>

                {pendingFiles.length > 0 && (
                  <div ref={attachmentContainerRef} className="absolute bottom-0 left-0 right-0">
                    <div className="flex flex-wrap gap-2">
                      {pendingFiles.map(file => (
                        <FileAttachmentPreview key={file.id} file={file} onRemove={() => handleRemoveFile(file.id)} uploading={file.uploading} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Row 2: Actions toolbar (doesn't steal editor width) */}
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex items-center gap-1 transition-opacity duration-200',
                      isMobileComposerEngaged && !isEditorFocused && 'opacity-30',
                      'sm:opacity-100'
                    )}
                  >
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={disabled || fileUploading}
                      className={cn('p-1.5 rounded-full transition-colors', 'hover:bg-muted text-muted-foreground hover:text-foreground', 'disabled:opacity-50 disabled:cursor-not-allowed')}
                      aria-label="Attach file"
                      title="Attach file (images, PDFs)"
                    >
                      <Icon name="paperclip" className="h-5 w-5" />
                    </button>

                    <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={!canEditComposer}
                          className={cn('p-1.5 rounded-full transition-colors', 'hover:bg-muted text-muted-foreground hover:text-foreground', 'disabled:opacity-50 disabled:cursor-not-allowed')}
                          aria-label="Insert emoji"
                          title="Insert emoji"
                        >
                          <Icon name="smiley" className="h-5 w-5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverPrimitive.Portal>
                        <PopoverPrimitive.Content
                          asChild
                          align="start"
                          side="top"
                          sideOffset={8}
                          className="z-[1004] p-0 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]"
                        >
                          <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                        </PopoverPrimitive.Content>
                      </PopoverPrimitive.Portal>
                    </Popover>
                  </div>

                  {children ? <div className="ml-1 flex items-center gap-3">{children}</div> : null}
                </div>

                <div className="flex items-center gap-2">
                  <div className={cn('flex items-center gap-2 transition-opacity duration-200', isMobileComposerEngaged && 'opacity-30', 'sm:opacity-100')}>
                    <button
                      onClick={() => {
                        if (conversationId) {
                          const newPlugins: ConversationPlugin[] = hasWebBrowsing ? [] : [{ id: 'web', max_results: 3 }]
                          updateConversationState.mutate({
                            conversationId,
                            state: {
                              plugins: newPlugins,
                            } as ConversationState,
                          })
                        } else {
                          setPendingWebBrowsing(!pendingWebBrowsing)
                        }
                      }}
                      disabled={updateConversationState.isPending || isLoadingConversation || isStreamingEffective}
                      className={cn(
                        'group inline-flex items-center gap-1.5 px-1.5 sm:px-2 py-1.5 rounded-lg transition-colors',
                        hasWebBrowsing ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        isMobileComposerEngaged ? 'hidden sm:inline-flex' : 'inline-flex'
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
                          <span className="hidden sm:inline text-xs font-medium whitespace-nowrap">Search</span>
                        </>
                      ) : (
                        <Icon name="globe" className="h-5 w-5" />
                      )}
                    </button>
                  </div>

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
          ) : (
            <div className={cn('flex relative gap-2', minimal ? 'items-center pl-3 pr-2 py-2.5' : 'items-end px-3 py-2.5')}>
              {/* Left-side Actions */}
              <div className={cn('flex flex-shrink-0 items-center', minimal ? 'gap-2' : 'gap-2 pb-0.5')}>
                <div
                  className={cn(
                    'flex items-center gap-1 transition-opacity duration-200',
                    isMobileComposerEngaged && !isEditorFocused && 'opacity-30',
                    'sm:opacity-100'
                  )}
                >
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || fileUploading}
                    className={cn('p-1.5 rounded-full transition-colors', 'hover:bg-muted text-muted-foreground hover:text-foreground', 'disabled:opacity-50 disabled:cursor-not-allowed')}
                    aria-label="Attach file"
                    title="Attach file (images, PDFs)"
                  >
                    <Icon name="paperclip" className="h-5 w-5" />
                  </button>

                  <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={!canEditComposer}
                        className={cn('p-1.5 rounded-full transition-colors', 'hover:bg-muted text-muted-foreground hover:text-foreground', 'disabled:opacity-50 disabled:cursor-not-allowed')}
                        aria-label="Insert emoji"
                        title="Insert emoji"
                      >
                        <Icon name="smiley" className="h-5 w-5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverPrimitive.Portal>
                      <PopoverPrimitive.Content
                        asChild
                        align="start"
                        side="top"
                        sideOffset={8}
                        className="z-[1004] p-0 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]"
                      >
                        <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                      </PopoverPrimitive.Content>
                    </PopoverPrimitive.Portal>
                  </Popover>
                </div>
              </div>

              {!minimal && children && <div className="mr-1 flex items-center gap-3">{children}</div>}

              <div
                className={cn('flex-1 min-w-0 relative z-10')}
                onPaste={handlePaste}
                style={{
                  paddingBottom: !minimal && attachmentHeight > 0 ? `${attachmentHeight}px` : undefined,
                }}
              >
                <div
                  className={cn(
                    'overflow-y-auto overflow-x-visible scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
                    minimal ? 'max-h-[140px]' : isStarter ? 'max-h-[300px]' : 'max-h-[220px]'
                  )}
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  <EditorContent editor={tiptap} />
                </div>

                {!minimal && pendingFiles.length > 0 && (
                  <div ref={attachmentContainerRef} className="absolute bottom-0 left-0 right-0">
                    <div className="flex flex-wrap gap-2">
                      {pendingFiles.map(file => (
                        <FileAttachmentPreview key={file.id} file={file} onRemove={() => handleRemoveFile(file.id)} uploading={file.uploading} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={cn('flex flex-shrink-0 items-center', minimal ? 'gap-2' : 'gap-2 pb-0.5')}>
                <div className={cn('flex items-center gap-2 transition-opacity duration-200', isMobileComposerEngaged && 'opacity-30', 'sm:opacity-100')}>
                  <button
                    onClick={() => {
                      if (conversationId) {
                        const newPlugins: ConversationPlugin[] = hasWebBrowsing ? [] : [{ id: 'web', max_results: 3 }]
                        updateConversationState.mutate({
                          conversationId,
                          state: {
                            plugins: newPlugins,
                          } as ConversationState,
                        })
                      } else {
                        setPendingWebBrowsing(!pendingWebBrowsing)
                      }
                    }}
                    disabled={updateConversationState.isPending || isLoadingConversation || isStreamingEffective}
                    className={cn(
                      'group items-center gap-1.5 px-1.5 sm:px-2 py-1.5 rounded-lg transition-colors',
                      hasWebBrowsing ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      isMobileComposerEngaged ? 'hidden sm:inline-flex' : 'inline-flex'
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
                        <span className="hidden sm:inline text-xs font-medium whitespace-nowrap">Search</span>
                      </>
                    ) : (
                      <Icon name="globe" className="h-5 w-5" />
                    )}
                  </button>
                </div>

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
          )}

          {/* Disclaimer: only show when an agent is tagged in the draft */}
          {draftHasAgentMention && (
            <div className={cn('border-t border-border/40 text-[11px] leading-snug text-muted-foreground', minimal ? 'px-3 py-1' : 'px-3 py-1.5')}>
              Agents use AI and may make mistakes. Double-check important details before sending.
            </div>
          )}
        </div>

        {/* Cost hint removed (per product/UI request). */}
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
        width: 100%;
        overflow: hidden;
      }
      .tiptap.tiptap--minimal p.is-editor-empty:first-child::before {
        float: none;
        height: auto;
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        display: block;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `}</style>
  )
}
