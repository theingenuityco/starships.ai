'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'

interface MessageContentProps {
  content: string
  messageId: string
  className?: string
  enableMarkdown?: boolean
  enableCopy?: boolean
  enableLinkPreview?: boolean
  isStreaming?: boolean
}

export function MessageContent({ content, messageId, className, enableMarkdown = true, enableCopy = true, enableLinkPreview = true, isStreaming = false }: MessageContentProps) {
  const { theme } = useTheme()
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})

  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(content)
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

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [blockId]: false }))
      }, 2000)
    } catch (error) {
      toast.error('Failed to copy code')
    }
  }

  const detectLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(urlRegex)

    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 inline-flex items-center gap-1">
            {part}
            <ExternalLink className="w-3 h-3" />
          </a>
        )
      }
      return part
    })
  }

  if (!enableMarkdown) {
    return (
      <div className={cn('relative group', className)}>
        <div className="text-sm leading-relaxed whitespace-pre-wrap flex items-start gap-2">
          <span className="flex-1">{enableLinkPreview ? detectLinks(content) : content}</span>
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

  // For streaming content, we need to be careful about markdown parsing
  // since incomplete markdown can cause parsing errors
  const safeContent = isStreaming ? content + (content.endsWith('`') ? '' : '') : content

  return (
    <div className={cn('relative group', className)}>
      <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none message-content">
        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-xs font-medium">Assistant is thinking...</span>
          </div>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom paragraph rendering
            p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

            // Custom link rendering with preview
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 inline-flex items-center gap-1">
                {children}
                <ExternalLink className="w-3 h-3" />
              </a>
            ),

            // Enhanced code block rendering
            code: ({ node, className: codeClassName, children, ...props }) => {
              const match = /language-(\w+)/.exec(codeClassName || '')
              const language = match ? match[1] : ''
              const blockId = `${messageId}-${Math.random().toString(36).substr(2, 9)}`

              // Check if it's a code block (has language) vs inline code
              const isCodeBlock = Boolean(language)

              if (isCodeBlock) {
                const codeContent = String(children).replace(/\n$/, '')

                return (
                  <div className="relative rounded-lg border bg-muted/30 my-2">
                    {/* Code block header */}
                    <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
                      <span className="text-xs font-medium text-muted-foreground uppercase">{language}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyCodeBlock(codeContent, blockId)}>
                        {copiedStates[blockId] ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>

                    {/* Code content */}
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

            // Custom blockquote
            blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/20 pl-4 py-2 bg-muted/20 rounded-r-lg my-2">{children}</blockquote>,

            // Custom list styling
            ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,

            // Custom table styling
            table: ({ children }) => (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full border-collapse border border-border rounded-lg">{children}</table>
              </div>
            ),
            th: ({ children }) => <th className="border border-border bg-muted/50 px-3 py-2 text-left font-medium">{children}</th>,
            td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,

            // Custom heading styles
            h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2 first:mt-0">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-medium mt-3 mb-2 first:mt-0">{children}</h3>,
          }}
        >
          {safeContent}
        </ReactMarkdown>

        {/* Streaming cursor */}
        {isStreaming && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />}
      </div>

      {/* Copy button for entire message */}
      {enableCopy && (
        <Button variant="ghost" size="icon" className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6" onClick={handleCopyContent}>
          <Copy className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}
