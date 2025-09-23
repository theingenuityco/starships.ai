'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { Check, Copy, ExternalLink, Loader2, Wrench } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState, useMemo, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import type { MessageModel } from '@starships/protocol'

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
  agentName?: string
  toolCalls?: NonNullable<MessageModel['tool_calls']>
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
  agentName,
  toolCalls,
  toolResults = [],
  messageType,
}: MessageContentProps) {
  const { theme } = useTheme()
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})

  // Tool call header icon state handling
  const totalToolCalls = Array.isArray(toolCalls) ? toolCalls.length : 0
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

  const parsedJson = useMemo(() => {
    try {
      const t = (displayContent || '').trim()
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        return JSON.parse(t)
      }
    } catch {}
    return null as any
  }, [displayContent])

  // Natural language header with tense:
  // Ongoing: "<agent> is using tool X[, Y] [& some others...]"
  // Completed: "<agent> used tool X[, Y] [& some others...]"
  const toolCallHeaderLabel = useMemo(() => {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null
    const names = toolCalls.map(tc => (tc as any)?.function?.name).filter(Boolean) as string[]
    const unique = Array.from(new Set(names))
    const agent = agentName || 'Assistant'

    const isOngoing = hasPendingToolCalls || (isStreaming && hasAnyToolCalls && !allToolCallsDone)
    const verb = isOngoing ? 'is using' : 'used'
    const noun = unique.length === 1 ? 'tool' : 'tools'

    if (unique.length === 0) return `${agent} ${verb} ${noun}`
    if (unique.length === 1) return `${agent} ${verb} ${noun} ${unique[0]}`
    const visible = unique.slice(0, 2)
    return unique.length > 2 ? `${agent} ${verb} ${noun} ${visible.join(', ')} & some others...` : `${agent} ${verb} ${noun} ${visible.join(' & ')}`
  }, [toolCalls, agentName, hasPendingToolCalls, allToolCallsDone, isStreaming, hasAnyToolCalls])

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

  // Memoized ReactMarkdown components for optimal streaming performance
  const markdownComponents = useMemo(
    () => ({
      // Enhanced paragraph rendering
      p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

      // Enhanced link rendering with external indicator
      a: ({ href, children }: any) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 inline-flex items-center gap-1">
          {children}
          {enableLinkPreview && <ExternalLink className="w-3 h-3" />}
        </a>
      ),

      // Enhanced code block rendering - unified for streaming + completed
      code: ({ node, className: codeClassName, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(codeClassName || '')
        const language = match ? match[1] : ''
        const blockId = `${messageId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
        const isCodeBlock = Boolean(language)

        if (isCodeBlock) {
          const codeContent = String(children).replace(/\n$/, '')

          return (
            <div className="relative rounded-lg border bg-muted/30 my-2">
              {/* Code block header with language and copy button */}
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
                <span className="text-xs font-medium text-muted-foreground uppercase">{language}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(codeContent, blockId)}>
                  {copiedStates[blockId] ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>

              {/* Syntax highlighted code content */}
              <SyntaxHighlighter
                style={theme === 'dark' ? oneDark : oneLight}
                language={language}
                PreTag="div"
                className="!m-0 !bg-transparent code-block-enhanced"
                customStyle={{
                  margin: 0,
                  background: 'transparent',
                  fontSize: '0.875rem',
                  padding: '1rem',
                  lineHeight: '1.5',
                }}
              >
                {codeContent}
              </SyntaxHighlighter>
            </div>
          )
        }

        // Inline code
        return (
          <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
            {children}
          </code>
        )
      },

      // Enhanced blockquote
      blockquote: ({ children }: any) => <blockquote className="border-l-4 border-primary/20 pl-4 py-2 bg-muted/20 rounded-r-lg my-2">{children}</blockquote>,

      // Enhanced list styling
      ul: ({ children }: any) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
      ol: ({ children }: any) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,

      // Enhanced table styling
      table: ({ children }: any) => (
        <div className="overflow-x-auto my-2">
          <table className="min-w-full border-collapse border border-border rounded-lg">{children}</table>
        </div>
      ),
      th: ({ children }: any) => <th className="border border-border bg-muted/50 px-3 py-2 text-left font-medium">{children}</th>,
      td: ({ children }: any) => <td className="border border-border px-3 py-2">{children}</td>,

      // Enhanced heading styles
      h1: ({ children }: any) => <h1 className="text-xl font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
      h2: ({ children }: any) => <h2 className="text-lg font-semibold mt-3 mb-2 first:mt-0">{children}</h2>,
      h3: ({ children }: any) => <h3 className="text-base font-medium mt-3 mb-2 first:mt-0">{children}</h3>,
    }),
    [messageId, theme, copiedStates, enableLinkPreview]
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
            <Copy className="w-3 h-3" />
          </Button>
        )}
      </div>
    )
  }

  // UNIFIED RENDERING: Same ReactMarkdown for both streaming and completed messages
  return (
    <div className={cn('relative group', className)}>
      {/* Unified markdown rendering - same for both streaming and completed, but skip for tool_result messages */}
      {messageType !== 'tool_result' && (
        <div className={cn('text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none message-content', isStreaming && displayContent && 'streaming-caret')}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {displayContent}
          </ReactMarkdown>
        </div>
      )}

      {/* Tool calls and results rendering for assistant messages */}
      {Array.isArray(toolCalls) && toolCalls.length > 0 && messageType !== 'tool_result' && (
        <div className="my-1.5">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="p-0 hover:bg-muted/30 rounded-sm justify-start text-sm leading-relaxed text-muted-foreground hover:text-foreground transition-colors mb-1 font-medium">
              {isStreaming && hasAnyToolCalls && completedToolResults < totalToolCalls ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : allToolCallsDone && showCompletionTick ? (
                <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
              ) : (
                <Wrench className="w-3 h-3" />
              )}
              {toolCallHeaderLabel ?? `Tool Calls (${toolCalls.length})`}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-1.5">
                {toolCalls.map((tc, idx) => {
                  const rawArgs = (tc as any)?.function?.arguments ?? ''
                  let prettyArgs = ''
                  try {
                    prettyArgs = JSON.stringify(JSON.parse(rawArgs), null, 2)
                  } catch {
                    prettyArgs = String(rawArgs)
                  }
                  const hasArgs = (() => {
                    const raw = typeof rawArgs === 'string' ? rawArgs.trim() : ''
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
                  const rawCallId = (tc as any)?.id ?? (tc as any)?.call_id ?? (tc as any)?.tool_call_id ?? (tc as any)?.function?.id ?? null

                  const toolCallId = rawCallId != null ? String(rawCallId) : ''
                  const combinedBlockId = `${messageId}-tool-all-${idx}`

                  // Find matching tool result using multiple possible id fields, normalized to strings
                  const matchingResult = toolResults?.find((result: any) => {
                    const rid = (result as any)?.tool_call_id ?? (result as any)?.call_id ?? (result as any)?.id
                    if (rid == null) return false
                    return String(rid) === toolCallId
                  })

                  return (
                    <div key={idx}>
                      <Card className={cn('border bg-muted/20', matchingResult && 'border-l-4 border-l-green-500')}>
                        <div className="flex items-center justify-between px-3 py-2 border-b">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Function</span>
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted">{funcName}</span>
                            {/* ID removed from header */}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                // Build a single payload that includes function, id, arguments and (optional) result
                                let argsParsed: any
                                try {
                                  argsParsed = JSON.parse(rawArgs)
                                } catch {
                                  // Fallback to the prettified string for non-JSON args
                                  argsParsed = prettyArgs
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
                              {copiedStates[combinedBlockId] ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
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
                                  <Check className="w-3 h-3" />
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
                <Check className="w-3 h-3" />
                Tool Result (Standalone)
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(parsedJson ? JSON.stringify(parsedJson, null, 2) : displayContent, `${messageId}-tool-result`)}>
              {copiedStates[`${messageId}-tool-result`] ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
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
              {copiedStates[`${messageId}-workflow-result`] ? <Check className="w-3 h-3 text-blue-500" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
          <pre className="text-xs p-3 overflow-x-auto">
            <code>{JSON.stringify(parsedJson, null, 2)}</code>
          </pre>
        </Card>
      )}

      {/* Streaming indicator - shows after all content including tool calls while streaming */}
      {isStreaming && !hasAnyToolCalls && (
        <div className="flex items-center gap-2 mt-1 text-muted-foreground">
          <span className="text-xs font-medium">{agentName || 'Assistant'} is responding...</span>
          {chunks.length > 0 && <span className="text-xs">({chunks.length} chunks)</span>}
          <Loader2 className="w-3 h-3 animate-spin" />
        </div>
      )}

      {/* Copy button for entire message */}
      {enableCopy && !isStreaming && (
        <Button variant="ghost" size="icon" className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6" onClick={handleCopyContent}>
          <Copy className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}
