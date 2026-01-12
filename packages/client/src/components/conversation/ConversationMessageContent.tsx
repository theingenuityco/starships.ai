'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

import { useTheme } from 'next-themes'
import { useState, useMemo, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { getMarkdownComponents, tableToMarkdown } from '@/components/markdown/markdownComponents'
import { toast } from 'sonner'
import type { MessageModel } from '@starships/protocol'
import type { LlmToolCall } from '@starships/autopilot'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { MessageAttachment, MessageAttachmentSkeleton } from './MessageAttachment'
import { InlineWidgetRenderer } from '@/components/widgets/InlineWidgetRenderer'
import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { markAnimationComplete } from '@/hooks/useMessageAnimationState'

interface StreamChunk {
  content: string
  position: number
  timestamp: number
}

/**
 * Aggregate stream chunks into a single string.
 *
 * Notes:
 * - Some producers emit true deltas (content = new tokens only)
 * - Others emit cumulative chunks (content = full text so far)
 * - `position` is treated as the accumulated length after applying the chunk (if present).
 *
 * This function is defensive and avoids the common "duplicate on completion" glitch where a final
 * cumulative chunk would otherwise get concatenated onto prior deltas.
 */
function aggregateStreamChunks(chunks: StreamChunk[]): string {
  if (!Array.isArray(chunks) || chunks.length === 0) return ''
  const sorted = [...chunks].sort((a, b) => a.position - b.position)
  let agg = ''

  for (const c of sorted) {
    const pos = typeof c.position === 'number' ? c.position : NaN
    const text = String(c.content ?? '')
    if (!text) continue

    // If position is invalid, fall back to naive concatenation.
    if (!Number.isFinite(pos) || pos <= 0) {
      agg += text
      continue
    }

    // If this chunk looks cumulative (or otherwise longer than the missing delta),
    // only take the missing suffix so we don't duplicate what we've already shown.
    const missing = pos - agg.length
    if (missing <= 0) continue

    if (text.length >= pos) {
      // Cumulative: content contains at least the first `pos` chars.
      agg = text.slice(0, pos)
      continue
    }

    if (text.length > missing) {
      agg += text.slice(text.length - missing)
    } else {
      agg += text
    }
  }

  return agg
}

function useSlabTypewriterText({
  fullText,
  isStreaming,
  resetKey,
  onComplete,
  /**
   * When true, and we mount with a non-empty fullText while streaming (e.g. page refresh mid-stream),
   * start from the current tail so we don't "re-type" already streamed content.
   */
  hydrateFromExistingOnMount = false,
}: {
  fullText: string
  isStreaming: boolean
  resetKey: string
  onComplete?: () => void
  hydrateFromExistingOnMount?: boolean
}) {
  // Slab-based typewriter effect: reveal chunks of text at a time
  const [displayedLength, setDisplayedLength] = useState(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const displayedLengthRef = useRef<number>(0)
  const targetLengthRef = useRef<number>(0)
  const onCompleteRef = useRef<typeof onComplete>(onComplete)
  const didHydrateOnMountRef = useRef(false)

  // Avoid re-running the animation effect on every render due to unstable callback identities.
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Keep ref in sync with state
  useEffect(() => {
    displayedLengthRef.current = displayedLength
  }, [displayedLength])

  // Reset displayed length when resetKey changes (new message / new stream)
  useEffect(() => {
    setDisplayedLength(0)
    displayedLengthRef.current = 0
    targetLengthRef.current = 0
    didHydrateOnMountRef.current = false
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [resetKey])

  // #region agent log
  // On refresh mid-stream, mount can have a large non-empty `fullText`.
  // Hydrate the typewriter to the current tail so we don't replay already streamed tokens.
  useEffect(() => {
    try {
      if (didHydrateOnMountRef.current) return
      if (!hydrateFromExistingOnMount) return
      if (!isStreaming) return
      if (!fullText || fullText.length === 0) return
      didHydrateOnMountRef.current = true
      setDisplayedLength(fullText.length)
      displayedLengthRef.current = fullText.length
      targetLengthRef.current = fullText.length
      fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix-3',hypothesisId:'G',location:'ConversationMessageContent.tsx:useSlabTypewriterText:hydrate',message:'Hydrated typewriter to existing stream tail on mount',data:{resetKey,fullTextLen:fullText.length},timestamp:Date.now()})}).catch(()=>{});
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateFromExistingOnMount, isStreaming, fullText, resetKey])
  // #endregion

  useEffect(() => {
    // Update target length ref whenever fullText changes
    targetLengthRef.current = fullText.length

    // If not streaming and we haven't started typewriting, sync the displayedLength
    // This ensures state is correct even though displayText handles the rendering
    if (!isStreaming && displayedLengthRef.current === 0 && fullText.length > 0) {
      setDisplayedLength(fullText.length)
      displayedLengthRef.current = fullText.length
      onCompleteRef.current?.()
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }

    // Calculate slab size and delay based on pending characters
    // More pending = larger slabs and faster updates to catch up
    const calculateSlabParams = (pending: number): { slabSize: number; delay: number } => {
      if (pending <= 0) {
        return { slabSize: 1, delay: 50 } // Small chunks when caught up
      }

      // Calculate slab size: larger when more pending
      // Min slab: 3 chars, Max slab: 50 chars
      const minSlab = 3
      const maxSlab = 50
      const slabScaleFactor = 20
      const slabSize = Math.min(maxSlab, Math.max(minSlab, Math.round(minSlab + pending / slabScaleFactor)))

      // Calculate delay: faster when more pending
      // Min delay: 10ms, Max delay: 50ms
      const minDelay = 10
      const maxDelay = 50
      const delayScaleFactor = 30
      const delay = minDelay + (maxDelay - minDelay) / (1 + pending / delayScaleFactor)

      return {
        slabSize: Math.round(slabSize),
        delay: Math.max(minDelay, Math.min(maxDelay, Math.round(delay))),
      }
    }

    // Slab-based animation: reveal chunks of text at a time
    const revealNextSlab = () => {
      const current = displayedLengthRef.current
      const target = targetLengthRef.current

      if (current >= target) {
        // All content revealed, stop and mark animation as complete
        timeoutRef.current = null
        onCompleteRef.current?.()
        return
      }

      // Calculate pending and determine slab size
      const pending = target - current
      const { slabSize, delay } = calculateSlabParams(pending)

      // Reveal next slab (but don't exceed target)
      const next = Math.min(current + slabSize, target)
      setDisplayedLength(next)
      displayedLengthRef.current = next

      // If we hit the target, complete immediately (avoid needing an extra tick).
      if (next >= target) {
        timeoutRef.current = null
        onCompleteRef.current?.()
        return
      }

      // Continue revealing slabs with dynamic delay
      timeoutRef.current = setTimeout(revealNextSlab, delay)
    }

    // Continue animation if there's content to reveal (even after streaming stops)
    // This ensures the typewriter effect completes smoothly
    // Only start if we're streaming or have already started (displayedLength > 0)
    if (timeoutRef.current === null && displayedLengthRef.current < targetLengthRef.current) {
      // Only start typewriter if we're streaming or have already started (displayedLength > 0)
      if (isStreaming || displayedLengthRef.current > 0) {
        const pending = targetLengthRef.current - displayedLengthRef.current
        const { delay, slabSize } = calculateSlabParams(pending)

        // If just starting (displayedLength is 0), reveal first slab immediately
        // then continue with delay for subsequent slabs
        if (displayedLengthRef.current === 0 && pending > 0) {
          // Reveal first slab immediately to avoid flash
          const firstSlab = Math.min(slabSize, pending)
          setDisplayedLength(firstSlab)
          displayedLengthRef.current = firstSlab
          // Then continue with delay for next slab
          timeoutRef.current = setTimeout(revealNextSlab, delay)
        } else {
          // Already started, continue with delay
          timeoutRef.current = setTimeout(revealNextSlab, delay)
        }
      }
    }

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [fullText, isStreaming, resetKey])

  // Build display text with typewriter effect
  // Continue typewriter effect until it catches up to full text, even after streaming stops
  const displayText = useMemo(() => {
    // If not streaming and we haven't started typewriting (displayedLength is 0),
    // show full text immediately. This handles completed messages.
    if (!isStreaming && displayedLength === 0 && fullText.length > 0) {
      return fullText
    }
    // If we're streaming and haven't started typewriting yet, show nothing
    // This prevents the flash of content before animation starts
    if (isStreaming && displayedLength === 0) {
      return ''
    }
    // If we've started typewriting, show the revealed portion
    if (displayedLength > 0) {
      return fullText.slice(0, displayedLength)
    }
    // Fallback: show nothing if no content
    return ''
  }, [fullText, displayedLength, isStreaming])

  return { displayText, displayedLength }
}

interface MessageContentProps {
  content: string
  messageId: string
  className?: string
  enableMarkdown?: boolean
  enableCopy?: boolean
  enableLinkPreview?: boolean
  isStreaming?: boolean
  chunks?: StreamChunk[]
  // Optional reasoning content and chunks
  reasoning?: string
  reasoningChunks?: StreamChunk[]
  agentName?: string
  toolCalls?: NonNullable<MessageModel['toolCalls']>
  toolResults?: any[]
  messageType?: MessageModel['messageType']
  // Attachments
  attachmentIds?: string[]
  starshipId?: string
  // Whether we're awaiting tool results (for showing loading state)
  isAwaitingToolResults?: boolean
  // Whether this is the last message in the conversation
  isLastMessage?: boolean
}

// Known widget types from public-docs
const KNOWN_WIDGET_TYPES = new Set(['StatCard', 'DataTable', 'MetricGrid', 'BarChart', 'LineChart', 'AreaChart', 'PieChart', 'DonutChart', 'RadarChart', 'RadialChart'])

// Helper to safely parse JSON
function tryParseJSON(value: any): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

export function ConversationMessageContent({
  content,
  messageId,
  className,
  enableMarkdown = true,
  enableCopy = true,
  enableLinkPreview = true,
  isStreaming = false,
  chunks = [],
  reasoning,
  reasoningChunks = [],
  agentName,
  toolCalls,
  toolResults = [],
  messageType,
  attachmentIds,
  starshipId,
  isAwaitingToolResults = false,
  isLastMessage = false,
}: MessageContentProps) {
  const { theme } = useTheme()
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})

  // Fetch attachments metadata
  const { data: attachments, isLoading: isLoadingAttachments } = useMessageAttachments(attachmentIds, starshipId)

  // Normalize tool calls to retain early tool-first deltas:
  // keep entries if function.name exists OR id exists OR arguments exist
  // Also require function object to exist for meaningful rendering
  const normalizedToolCalls = useMemo<LlmToolCall[]>(() => {
    if (!Array.isArray(toolCalls)) return []
    return (toolCalls as unknown as LlmToolCall[]).filter(tc => {
      if (typeof tc !== 'object' || tc === null) return false
      const tcAny = tc as any
      // Require function object to exist for meaningful rendering
      if (!tcAny?.function || typeof tcAny.function !== 'object') return false
      // Keep if function.name exists OR id exists OR function.arguments exists
      const hasFunctionName = tcAny.function?.name != null && String(tcAny.function.name).trim().length > 0
      const hasId = tcAny?.id != null && String(tcAny.id).trim().length > 0
      const hasArguments =
        tcAny.function?.arguments != null &&
        ((typeof tcAny.function.arguments === 'string' && tcAny.function.arguments.trim().length > 0) ||
          (typeof tcAny.function.arguments === 'object' && Object.keys(tcAny.function.arguments).length > 0))
      return hasFunctionName || hasId || hasArguments
    })
  }, [toolCalls])

  // Tool call header icon state handling
  const totalToolCalls = normalizedToolCalls.length
  const completedToolResults = Array.isArray(toolResults) ? toolResults.length : 0
  const allToolCallsDone = totalToolCalls > 0 && completedToolResults >= totalToolCalls
  // Show loading ONLY when some tool results are missing.
  // IMPORTANT: do NOT keep showing loading solely because the global turn is in `waiting_for_tools`;
  // once the matching tool_result messages arrive, the tool panel should stop spinning immediately.
  const hasPendingToolCalls = totalToolCalls > 0 && completedToolResults < totalToolCalls
  const hasAnyToolCalls = totalToolCalls > 0

  const [showCompletionTick, setShowCompletionTick] = useState(false)
  const prevCompletedRef = useRef<number>(completedToolResults)
  const isFirstRenderRef = useRef(true)
  const hasShownTickRef = useRef(false)

  useEffect(() => {
    // Skip tick on initial mount even if results already exist (reloads)
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      prevCompletedRef.current = completedToolResults
      return
    }

    const prevCompleted = prevCompletedRef.current
    prevCompletedRef.current = completedToolResults

    // Trigger tick only on the first transition to "all done"
    if (!hasShownTickRef.current && totalToolCalls > 0 && prevCompleted < totalToolCalls && completedToolResults >= totalToolCalls) {
      hasShownTickRef.current = true
      setShowCompletionTick(true)
      const t = setTimeout(() => setShowCompletionTick(false), 2000)
      return () => clearTimeout(t)
    }
  }, [completedToolResults, totalToolCalls, messageId])

  // Build full aggregated content from chunks
  const fullContent = useMemo(() => {
    const hasChunks = Array.isArray(chunks) && chunks.length > 0
    if (!hasChunks) {
      return content
    }

    const aggregated = aggregateStreamChunks(chunks)

    // While streaming, use aggregated chunks
    if (isStreaming) return aggregated

    // After completion, prefer server-finalized content; if missing, fall back to aggregated chunks
    return content && content.trim().length > 0 ? content : aggregated
  }, [content, chunks, isStreaming])

  const displayReasoningFull = useMemo(() => {
    const hasR = Array.isArray(reasoningChunks) && reasoningChunks.length > 0
    if (!hasR) return reasoning || ''
    const agg = aggregateStreamChunks(reasoningChunks)
    return isStreaming ? agg : reasoning && reasoning.trim().length > 0 ? reasoning : agg
  }, [reasoning, reasoningChunks, isStreaming])

  const { displayText: displayContent } = useSlabTypewriterText({
    fullText: fullContent,
    isStreaming,
    resetKey: messageId,
    onComplete: () => markAnimationComplete(messageId),
    hydrateFromExistingOnMount: true,
  })

  const { displayText: displayReasoning } = useSlabTypewriterText({
    fullText: displayReasoningFull,
    isStreaming,
    resetKey: `${messageId}-reasoning`,
    hydrateFromExistingOnMount: true,
  })

  // Determine whether reasoning panel should auto-open.
  // Keep it open only while reasoning-only is streaming; collapse once content OR toolCalls start (and on reload).
  const hasTextChunksNow = Array.isArray(chunks) && chunks.length > 0
  const hasFinalTextNow = typeof content === 'string' && content.trim().length > 0
  const hasToolCallsNow = Array.isArray(toolCalls) && toolCalls.length > 0
  const openReasoning = Boolean(isStreaming && displayReasoningFull && displayReasoningFull.trim().length > 0 && !(hasTextChunksNow || hasFinalTextNow || hasToolCallsNow))
  const agentLabel = agentName && agentName.trim().length > 0 ? agentName : 'Agent'
  const reasoningHeaderLabel = isStreaming && openReasoning ? `${agentLabel} is thinking` : `${agentLabel} had a thought`

  const parsedJson = useMemo(() => {
    try {
      const t = (displayContent || '').trim()
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        return JSON.parse(t)
      }
    } catch {}
    return null as any
  }, [displayContent])

  // Collapsible should always start closed; users can expand manually

  // Natural language header with tense and inline code chips for tool names (no 'tool' word):
  // Ongoing: "<agent> is using `X`[, `Y`] [& some others...]"
  // Completed: "<agent> used `X`[, `Y`] [& some others...]"
  const toolCallHeaderLabel = useMemo(() => {
    if (!Array.isArray(normalizedToolCalls) || normalizedToolCalls.length === 0) return null
    const names = normalizedToolCalls.map(tc => (tc as any)?.function?.name).filter(Boolean) as string[]
    const unique = Array.from(new Set(names))
    const agent = agentName || 'Agent'

    const isOngoing = hasPendingToolCalls || (isStreaming && hasAnyToolCalls && !allToolCallsDone)
    const verb = isOngoing ? 'is using' : 'used'

    const Chip = ({ children }: any) => <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>

    if (unique.length === 0) {
      return (
        <>
          {agent} {verb}
        </>
      )
    }
    if (unique.length === 1) {
      return (
        <>
          {agent} {verb} <Chip>{unique[0]}</Chip>
        </>
      )
    }
    const visible = unique.slice(0, 2)
    if (unique.length > 2) {
      return (
        <>
          {agent} {verb} <Chip>{visible[0]}</Chip>, <Chip>{visible[1]}</Chip> & some others...
        </>
      )
    }
    return (
      <>
        {agent} {verb} <Chip>{visible[0]}</Chip> & <Chip>{visible[1]}</Chip>
      </>
    )
  }, [normalizedToolCalls, agentName, hasPendingToolCalls, allToolCallsDone, isStreaming, hasAnyToolCalls])

  const messageContainerRef = useRef<HTMLDivElement>(null)

  const extractMessageText = (): string => {
    const container = messageContainerRef.current
    if (!container) {
      return displayContent
    }

    const textClone = container.cloneNode(true) as HTMLElement

    // Remove UI elements
    textClone.querySelectorAll('button, [class*="group-hover"], [class*="opacity-0"]').forEach(el => el.remove())

    // Build plain text by traversing DOM and converting tables to markdown
    const extractPlainText = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || ''
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return ''
      }
      const element = node as HTMLElement

      // Convert table wrapper to markdown (same as individual table copy)
      if (element.classList?.contains('table-wrapper')) {
        const table = element.querySelector('table')
        return table ? '\n' + tableToMarkdown(table as HTMLTableElement) + '\n\n' : ''
      }

      // Recursively process child nodes
      return Array.from(node.childNodes).map(extractPlainText).join('')
    }

    return extractPlainText(textClone).trim()
  }

  const handleCopyContent = async () => {
    try {
      const container = messageContainerRef.current
      if (!container) {
        await navigator.clipboard.writeText(displayContent)
        toast.success('Message copied to clipboard')
        return
      }

      const htmlClone = container.cloneNode(true) as HTMLElement
      const textClone = container.cloneNode(true) as HTMLElement

      // Remove UI elements
      htmlClone.querySelectorAll('button, [class*="group-hover"], [class*="opacity-0"]').forEach(el => el.remove())
      textClone.querySelectorAll('button, [class*="group-hover"], [class*="opacity-0"]').forEach(el => el.remove())

      // Build plain text by traversing DOM and converting tables to markdown
      const extractPlainText = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || ''
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return ''
        }
        const element = node as HTMLElement

        // Convert table wrapper to markdown (same as individual table copy)
        if (element.classList?.contains('table-wrapper')) {
          const table = element.querySelector('table')
          return table ? '\n' + tableToMarkdown(table as HTMLTableElement) + '\n\n' : ''
        }

        // Recursively process child nodes
        return Array.from(node.childNodes).map(extractPlainText).join('')
      }

      const htmlContent = htmlClone.innerHTML
      const plainText = extractPlainText(textClone).trim()

      // Copy both HTML and plain text
      try {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([clipboardItem])
      } catch {
        await navigator.clipboard.writeText(plainText)
      }

      toast.success('Message copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy message')
    }
  }

  const handleExportContent = () => {
    try {
      const messageText = extractMessageText()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5) // Remove milliseconds and timezone
      const filename = `message-${messageId.slice(0, 8)}-${timestamp}.md`

      const blob = new Blob([messageText], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast.success('Message exported successfully')
    } catch (error) {
      toast.error('Failed to export message')
    }
  }

  const handleCopyCodeBlock = async (code: string, blockId: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedStates(prev => ({ ...prev, [blockId]: true }))
      toast.success('Code copied to clipboard')

      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [blockId]: false }))
      }, 2000)
    } catch (error) {
      toast.error('Failed to copy code')
    }
  }

  const handleCopyTable = async (tableContent: string, tableId: string, tableHtml?: string) => {
    try {
      // If we have HTML, copy both HTML (for rich text editors) and plain text (for plain text editors)
      if (tableHtml) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([tableHtml], { type: 'text/html' }),
          'text/plain': new Blob([tableContent], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([clipboardItem])
      } else {
        // Fallback to plain text only
        await navigator.clipboard.writeText(tableContent)
      }

      setCopiedStates(prev => ({ ...prev, [tableId]: true }))
      toast.success('Table copied to clipboard')

      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [tableId]: false }))
      }, 2000)
    } catch (error) {
      // Fallback to plain text if ClipboardItem API is not supported
      try {
        await navigator.clipboard.writeText(tableContent)
        setCopiedStates(prev => ({ ...prev, [tableId]: true }))
        toast.success('Table copied to clipboard')
        setTimeout(() => {
          setCopiedStates(prev => ({ ...prev, [tableId]: false }))
        }, 2000)
      } catch (fallbackError) {
        toast.error('Failed to copy table')
      }
    }
  }

  // Shared markdown components for consistent rendering across app
  const markdownComponents = useMemo(
    () => getMarkdownComponents({ theme, enableLinkPreview, messageId, copiedStates, onCopyCodeBlock: handleCopyCodeBlock, onCopyTable: handleCopyTable }),
    [theme, enableLinkPreview, messageId, copiedStates]
  )

  // Widget detection: Extract widgets from tool results
  const widgetResults = useMemo(() => {
    if (!Array.isArray(toolResults) || toolResults.length === 0) return []

    return toolResults
      .map((toolResult, index) => {
        // Parse result (might be string or object)
        const data = tryParseJSON(toolResult.content || toolResult.result)

        // Check if it's a widget result
        if (!data || typeof data !== 'object') return null
        if (!data.widgetType || !KNOWN_WIDGET_TYPES.has(data.widgetType)) return null
        if (!data.props || typeof data.props !== 'object') return null

        // Extract widget info
        return {
          id: data.id || `widget-${index}`,
          widgetType: data.widgetType,
          props: data.props,
          name: data.name || 'Untitled Widget',
          description: data.description,
          toolName: toolResult.toolName,
          toolCallId: toolResult.toolCallId,
          index,
        }
      })
      .filter((w): w is NonNullable<typeof w> => w !== null)
  }, [toolResults])

  // Fallback for non-markdown content (rare cases)
  if (!enableMarkdown) {
    return (
      <div className={cn('relative group', className)}>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {displayContent}
          {isStreaming && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />}
        </div>
      </div>
    )
  }

  // UNIFIED RENDERING: Same ReactMarkdown for both streaming and completed messages
  return (
    <div ref={messageContainerRef} className={cn('relative group w-full', className)}>
      {/* Reasoning (thinking) collapsible */}
      {displayReasoningFull && displayReasoningFull.trim().length > 0 && messageType !== 'tool_result' && (
        <div className="mb-2">
          {/* Remount when reasoning-only vs content-start toggles so defaultOpen is re-applied */}
          <Collapsible key={`reasoning-${openReasoning ? 'open' : 'closed'}`} defaultOpen={openReasoning}>
            <CollapsibleTrigger className="p-0 hover:bg-muted/30 rounded-sm justify-start text-sm leading-relaxed text-muted-foreground hover:text-foreground transition-colors mb-1 font-medium">
              {isStreaming && openReasoning ? <Icon name="loading" className="w-3 h-3 animate-spin" /> : <Icon name="message-circle-more" className="w-3 h-3" />}
              <span>{reasoningHeaderLabel}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <blockquote className="border-l-4 border-primary/20 px-4 py-2 bg-muted/20 rounded-r-lg my-1">
                <div className="prose dark:prose-invert max-w-none text-muted-foreground text-xs break-words" style={{ fontSize: '0.75rem', lineHeight: '1.25rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {displayReasoning}
                  </ReactMarkdown>
                </div>
              </blockquote>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Attachments */}
      {attachmentIds && attachmentIds.length > 0 && starshipId && (
        <div className="mb-1 space-y-2">
          {isLoadingAttachments
            ? // Loading state
              attachmentIds.map(id => <MessageAttachmentSkeleton key={id} />)
            : // Render attachments
              attachments?.map(attachment => <MessageAttachment key={attachment.id} attachment={attachment} />)}
        </div>
      )}

      {/* Unified markdown rendering - message content at normal size */}
      {messageType !== 'tool_result' && (
        <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none w-full break-words message-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {displayContent}
          </ReactMarkdown>
        </div>
      )}

      {/* Tool calls and results rendering for assistant messages */}
      {Array.isArray(normalizedToolCalls) && normalizedToolCalls.length > 0 && messageType !== 'tool_result' && (
        <div className="my-2.5">
          {/* Tools panel: keep collapsed by default and preserve user toggle state */}
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-full p-0 hover:bg-muted/30 rounded-sm justify-start text-sm leading-relaxed text-muted-foreground hover:text-foreground transition-colors mb-1 font-medium">
              {hasAnyToolCalls && hasPendingToolCalls ? (
                <Icon name="loading" className="w-3 h-3 animate-spin" />
              ) : allToolCallsDone && showCompletionTick ? (
                <Icon name="check" className="w-3 h-3 text-green-600 dark:text-green-400" />
              ) : (
                <Icon name="wrench" className="w-3 h-3" />
              )}
              {toolCallHeaderLabel ?? `Tool Calls (${normalizedToolCalls.length})`}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-1.5">
                {normalizedToolCalls.map((tc, idx) => {
                  const rawArgsAny = (tc as any)?.function?.arguments ?? ''
                  let prettyArgs = ''
                  try {
                    // Handle case where arguments might already be an object
                    if (typeof rawArgsAny === 'object' && rawArgsAny !== null) {
                      prettyArgs = JSON.stringify(rawArgsAny, null, 2)
                    } else {
                      const asStr = String(rawArgsAny)
                      prettyArgs = JSON.stringify(JSON.parse(asStr), null, 2)
                    }
                  } catch {
                    prettyArgs = String(rawArgsAny)
                  }
                  const hasArgs = (() => {
                    // Handle case where arguments might already be an object
                    if (typeof rawArgsAny === 'object' && rawArgsAny !== null) {
                      return Array.isArray(rawArgsAny) ? rawArgsAny.length > 0 : Object.keys(rawArgsAny).length > 0
                    }

                    const raw = typeof rawArgsAny === 'string' ? rawArgsAny.trim() : ''
                    if (!raw) return false
                    try {
                      const parsed = JSON.parse(raw)
                      if (parsed && typeof parsed === 'object') {
                        return Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0
                      }
                      return String(parsed).trim().length > 0
                    } catch {
                      return raw.length > 0
                    }
                  })()
                  const funcName = (tc as any)?.function?.name || 'unknown'

                  // Normalize tool call id from multiple potential fields to be resilient across providers
                  const rawCallId = (tc as any)?.id ?? (tc as any)?.call_id ?? (tc as any)?.toolCallId ?? (tc as any)?.function?.id ?? null

                  const toolCallId = rawCallId != null ? String(rawCallId) : ''
                  const combinedBlockId = `${messageId}-tool-all-${idx}`

                  // Find matching tool result using multiple possible id fields, normalized to strings
                  const matchingResult = toolResults?.find((result: any) => {
                    const rid = (result as any)?.toolCallId ?? (result as any)?.call_id ?? (result as any)?.id
                    if (rid == null) return false
                    return String(rid) === toolCallId
                  })

                  return (
                    <div key={idx}>
                      <Card className={cn('border bg-muted/20', matchingResult && 'border-l-4 border-l-green-500')}>
                        <div className="flex items-center justify-between px-3 py-2 border-b gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-xs text-muted-foreground flex-shrink-0">Function</span>
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted truncate">{funcName}</span>
                            {/* ID removed from header */}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                // Build a single payload that includes function, id, arguments and (optional) result
                                let argsParsed: any
                                if (typeof rawArgsAny === 'object' && rawArgsAny !== null) {
                                  argsParsed = rawArgsAny
                                } else {
                                  try {
                                    argsParsed = JSON.parse(String(rawArgsAny))
                                  } catch {
                                    // Fallback to the prettified string for non-JSON args
                                    argsParsed = prettyArgs
                                  }
                                }

                                let resultParsed: any = undefined
                                if (matchingResult) {
                                  const resultContent = matchingResult.content || ''
                                  try {
                                    const t = (resultContent || '').trim()
                                    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
                                      resultParsed = JSON.parse(t)
                                    } else {
                                      resultParsed = resultContent
                                    }
                                  } catch {
                                    resultParsed = resultContent
                                  }
                                }

                                const payload: any = {
                                  function: funcName,
                                  id: toolCallId || undefined,
                                  arguments: argsParsed,
                                  ...(typeof resultParsed !== 'undefined' ? { result: resultParsed } : {}),
                                }

                                handleCopyCodeBlock(JSON.stringify(payload, null, 2), combinedBlockId)
                              }}
                            >
                              {copiedStates[combinedBlockId] ? <Icon name="check" className="w-3 h-3 text-green-500" /> : <Icon name="copy" className="w-3 h-3" />}
                            </Button>
                          </div>
                        </div>

                        <div>
                          {hasArgs && (
                            <>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-3 pt-2">Arguments</div>
                              <pre className="text-xs p-3 pt-1 overflow-x-auto">
                                <code>{prettyArgs}</code>
                              </pre>
                            </>
                          )}

                          {matchingResult && (
                            <>
                              <div className="border-t border-border/50" />
                              <div className="flex items-center justify-between px-3 pt-2">
                                <div className="text-[10px] uppercase tracking-wide text-green-700 dark:text-green-300 font-medium flex items-center gap-2">
                                  <Icon name="check" className="w-3 h-3" />
                                  Result
                                </div>
                              </div>
                              <pre className="text-xs p-3 pt-1 overflow-x-auto">
                                <code>
                                  {(() => {
                                    const resultContent = matchingResult.content || ''
                                    try {
                                      const t = (resultContent || '').trim()
                                      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
                                        return JSON.stringify(JSON.parse(t), null, 2)
                                      }
                                    } catch {}
                                    return resultContent
                                  })()}
                                </code>
                              </pre>
                            </>
                          )}
                        </div>
                      </Card>
                    </div>
                  )
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Widget rendering: Display widgets inline when created/updated */}
      {widgetResults.length > 0 && messageType !== 'tool_result' && (
        <div className="space-y-4 mt-3 w-full max-w-none">
          {widgetResults.map(widget => {
            // Check if widget creation is pending (tool called but no result yet)
            const matchingToolCall = normalizedToolCalls.find((tc: any) => {
              const callId = tc?.id ?? tc?.call_id ?? tc?.toolCallId
              return callId && String(callId) === widget.toolCallId
            })
            const isPending =
              matchingToolCall &&
              !toolResults?.some((r: any) => {
                const rid = r?.toolCallId ?? r?.call_id ?? r?.id
                return rid && String(rid) === widget.toolCallId
              })

            const isUpdate = widget.toolName?.toLowerCase().includes('update')

            return (
              <div key={widget.id} className="w-full max-w-none mb-4">
                {/* Conversational widget header - looks like text */}
                <div className="text-sm w-full mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-muted-foreground">{isUpdate ? 'Updated' : 'Created'}</span>
                    <span className="font-medium">{widget.name}</span>
                  </div>
                  {widget.description && <div className="text-muted-foreground text-xs mt-1">{widget.description}</div>}
                </div>

                {/* Widget visualization - minimal styling, full width */}
                <div className="relative w-full max-w-none overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {isPending ? (
                    <div className="h-[420px] flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <LoadingSpinner className="w-5 h-5" />
                        <span className="text-xs text-muted-foreground">{isUpdate ? 'Updating...' : 'Creating...'}</span>
                      </div>
                    </div>
                  ) : (
                    <InlineWidgetRenderer
                      widget={{
                        widgetType: widget.widgetType,
                        props: widget.props,
                      }}
                      compactMode={true}
                      className="w-full"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tool result message rendering - fallback for unmatched results */}
      {messageType === 'tool_result' && (
        <Card className="mt-3 border-l-4 border-l-green-500 bg-green-50/30 dark:bg-green-950/20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-green-200/50 dark:border-green-800/50">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase text-green-700 dark:text-green-300 tracking-wide font-medium flex items-center gap-2">
                <Icon name="check" className="w-3 h-3" />
                Tool Result (Standalone)
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(parsedJson ? JSON.stringify(parsedJson, null, 2) : displayContent, `${messageId}-tool-result`)}>
              {copiedStates[`${messageId}-tool-result`] ? <Icon name="check" className="w-3 h-3 text-green-500" /> : <Icon name="copy" className="w-3 h-3" />}
            </Button>
          </div>
          <pre className="text-xs p-3 overflow-x-auto">
            <code>{parsedJson ? JSON.stringify(parsedJson, null, 2) : displayContent}</code>
          </pre>
        </Card>
      )}

      {/* Workflow output without tool calls */}
      {messageType === 'workflow_output' && (!toolCalls || toolCalls.length === 0) && parsedJson && (
        <Card className="mt-3 border bg-blue-50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-blue-200 dark:border-blue-800">
            <div className="text-xs uppercase text-blue-700 dark:text-blue-300 tracking-wide font-medium">Workflow Output</div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(JSON.stringify(parsedJson, null, 2), `${messageId}-workflow-result`)}>
              {copiedStates[`${messageId}-workflow-result`] ? <Icon name="check" className="w-3 h-3 text-blue-500" /> : <Icon name="copy" className="w-3 h-3" />}
            </Button>
          </div>
          <pre className="text-xs p-3 overflow-x-auto">
            <code>{JSON.stringify(parsedJson, null, 2)}</code>
          </pre>
        </Card>
      )}
    </div>
  )
}
