'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

import { useTheme } from 'next-themes'
import { useState, useMemo, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { getMarkdownComponents } from '@/components/markdown/markdownComponents'
import { toast } from 'sonner'
import type { MessageModel } from '@starships/protocol'
import type { LlmToolCall } from '@starships/autopilot'

interface StreamChunk {
  content: string
  position: number
  timestamp: number
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
}: MessageContentProps) {
  const { theme } = useTheme()
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})

  // Normalize tool calls to retain early tool-first deltas:
  // keep entries if function.name exists OR id exists OR arguments exist
  const normalizedToolCalls = useMemo<LlmToolCall[]>(() => (Array.isArray(toolCalls) ? (toolCalls as unknown as LlmToolCall[]).filter(tc => typeof tc === 'object' && tc !== null) : []), [toolCalls])

  // Tool call header icon state handling
  const totalToolCalls = normalizedToolCalls.length
  const completedToolResults = Array.isArray(toolResults) ? toolResults.length : 0
  const allToolCallsDone = totalToolCalls > 0 && completedToolResults >= totalToolCalls
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

  // Build display content from chunks when streaming; after completion fall back to chunks if final content wasn't persisted
  const displayContent = useMemo(() => {
    const hasChunks = Array.isArray(chunks) && chunks.length > 0
    if (!hasChunks) {
      return content
    }

    // Sort chunks by position to ensure correct order
    const sortedChunks = [...chunks].sort((a, b) => a.position - b.position)

    // Build content from chunks
    let aggregated = ''
    for (const chunk of sortedChunks) {
      aggregated += chunk.content
    }

    // While streaming, always render aggregated chunks
    if (isStreaming) return aggregated

    // After completion, prefer server-finalized content; if missing, fall back to aggregated chunks
    return content && content.trim().length > 0 ? content : aggregated
  }, [content, chunks, isStreaming])

  const displayReasoning = useMemo(() => {
    const hasR = Array.isArray(reasoningChunks) && reasoningChunks.length > 0
    if (!hasR) return reasoning || ''
    const sorted = [...reasoningChunks].sort((a, b) => a.position - b.position)
    let agg = ''
    for (const rc of sorted) agg += rc.content
    return isStreaming ? agg : reasoning && reasoning.trim().length > 0 ? reasoning : agg
  }, [reasoning, reasoningChunks, isStreaming])

  // Determine whether reasoning panel should auto-open.
  // Keep it open only while reasoning-only is streaming; collapse once content OR toolCalls start (and on reload).
  const hasTextChunksNow = Array.isArray(chunks) && chunks.length > 0
  const hasFinalTextNow = typeof content === 'string' && content.trim().length > 0
  const hasToolCallsNow = Array.isArray(toolCalls) && toolCalls.length > 0
  const openReasoning = Boolean(isStreaming && displayReasoning && displayReasoning.trim().length > 0 && !(hasTextChunksNow || hasFinalTextNow || hasToolCallsNow))
  const agentLabel = agentName && agentName.trim().length > 0 ? agentName : 'Assistant'
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
    const agent = agentName || 'Assistant'

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

  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(displayContent)
      toast.success('Message copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy message')
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

  // Shared markdown components for consistent rendering across app
  const markdownComponents = useMemo(
    () => getMarkdownComponents({ theme, enableLinkPreview, messageId, copiedStates, onCopyCodeBlock: handleCopyCodeBlock }),
    [theme, enableLinkPreview, messageId, copiedStates]
  )

  // Fallback for non-markdown content (rare cases)
  if (!enableMarkdown) {
    return (
      <div className={cn('relative group', className)}>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {displayContent}
          {isStreaming && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />}
        </div>
        {enableCopy && (
          <Button variant="ghost" size="icon" className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6" onClick={handleCopyContent}>
            <Icon name="copy" className="w-3 h-3" />
          </Button>
        )}
      </div>
    )
  }

  // UNIFIED RENDERING: Same ReactMarkdown for both streaming and completed messages
  return (
    <div className={cn('relative group w-full', className)}>
      {/* Reasoning (thinking) collapsible */}
      {displayReasoning && displayReasoning.trim().length > 0 && messageType !== 'tool_result' && (
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

      {/* Unified markdown rendering - message content at normal size */}
      {messageType !== 'tool_result' && (
        <div className={cn('text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none w-full break-words message-content', enableCopy && !isStreaming && 'pr-6')}>
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
              {isStreaming && hasAnyToolCalls && completedToolResults < totalToolCalls ? (
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

      {/* Copy button for entire message */}
      {enableCopy && !isStreaming && (
        <Button variant="ghost" size="icon" className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6" onClick={handleCopyContent}>
          <Icon name="copy" className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}
