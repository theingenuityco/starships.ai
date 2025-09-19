'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Check, Copy, ExternalLink, Loader2, Wrench } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import type { MessageModel } from '@starships/protocol'

interface ContentChunk {
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
  contentChunks?: ContentChunk[]
  agentName?: string
  toolCalls?: NonNullable<MessageModel['tool_calls']>
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
  contentChunks = [],
  agentName,
  toolCalls,
  messageType,
}: MessageContentProps) {
  const { theme } = useTheme()
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})

  // Build display content from chunks when streaming, use final content when complete
  const displayContent = useMemo(() => {
    if (!isStreaming || !contentChunks.length) {
      return content
    }

    // Sort chunks by position to ensure correct order
    const sortedChunks = [...contentChunks].sort((a, b) => a.position - b.position)

    // Build content from chunks
    let result = ''
    for (const chunk of sortedChunks) {
      result += chunk.content
    }

    return result
  }, [content, contentChunks, isStreaming])

  const parsedJson = useMemo(() => {
    try {
      const t = (displayContent || '').trim()
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        return JSON.parse(t)
      }
    } catch {}
    return null as any
  }, [displayContent])

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
      {/* Streaming indicator moved to the end of the content to avoid layout shift */}

      {/* Tool calls (function calling) */}
      {Array.isArray(toolCalls) && toolCalls.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-2">
            <Wrench className="w-3 h-3" />
            Tool calls
          </div>
          {toolCalls.map((tc, idx) => {
            const rawArgs = (tc as any)?.function?.arguments ?? ''
            let pretty = ''
            try {
              pretty = JSON.stringify(JSON.parse(rawArgs), null, 2)
            } catch {
              pretty = String(rawArgs)
            }
            const blockId = `${messageId}-tool-${idx}`
            const funcName = (tc as any)?.function?.name || 'unknown'
            return (
              <Card key={idx} className="border bg-muted/20">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Function</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted">{funcName}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(pretty, blockId)}>
                    {copiedStates[blockId] ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <pre className="text-xs p-3 overflow-x-auto">
                  <code>{pretty}</code>
                </pre>
              </Card>
            )
          })}
        </div>
      )}

      {/* Tool result (parsed JSON) */}
      {(messageType === 'workflow_output' || (parsedJson && Array.isArray(toolCalls) && toolCalls.length > 0)) && parsedJson && (
        <Card className="mb-3 border bg-muted/20">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">Tool result</div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(JSON.stringify(parsedJson, null, 2), `${messageId}-tool-result`)}>
              {copiedStates[`${messageId}-tool-result`] ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
          <pre className="text-xs p-3 overflow-x-auto">
            <code>{JSON.stringify(parsedJson, null, 2)}</code>
          </pre>
        </Card>
      )}

      {/* Unified markdown rendering - same for both streaming and completed */}
      <div className={cn('text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none message-content', isStreaming && displayContent && 'streaming-caret')}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {displayContent}
        </ReactMarkdown>
      </div>

      {/* Streaming indicator - shows below content while streaming to minimize layout shift */}
      {isStreaming && (
        <div className="flex items-center gap-2 mt-2 text-muted-foreground">
          <span className="text-xs font-medium">{agentName || 'Assistant'} is responding...</span>
          {contentChunks.length > 0 && <span className="text-xs">({contentChunks.length} chunks)</span>}
          <Loader2 className="w-3 h-3 animate-spin" />
        </div>
      )}

      {/* Tool calls (function calling) - rendered after message content */}
      {Array.isArray(toolCalls) && toolCalls.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-2">
            <Wrench className="w-3 h-3" />
            Tool calls
          </div>
          {toolCalls.map((tc, idx) => {
            const rawArgs = (tc as any)?.function?.arguments ?? ''
            let pretty = ''
            try {
              pretty = JSON.stringify(JSON.parse(rawArgs), null, 2)
            } catch {
              pretty = String(rawArgs)
            }
            const blockId = `${messageId}-tool-${idx}`
            const funcName = (tc as any)?.function?.name || 'unknown'
            return (
              <Card key={idx} className="border bg-muted/20">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Function</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted">{funcName}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(pretty, blockId)}>
                    {copiedStates[blockId] ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <pre className="text-xs p-3 overflow-x-auto">
                  <code>{pretty}</code>
                </pre>
              </Card>
            )
          })}
        </div>
      )}

      {/* Tool result (parsed JSON) - rendered after message content */}
      {(messageType === 'workflow_output' || (parsedJson && Array.isArray(toolCalls) && toolCalls.length > 0)) && parsedJson && (
        <Card className="mt-3 border bg-muted/20">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">Tool result</div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(JSON.stringify(parsedJson, null, 2), `${messageId}-tool-result`)}>
              {copiedStates[`${messageId}-tool-result`] ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
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
          <Copy className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}
