'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { tomorrow } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { useTheme } from 'next-themes'

interface ChatMessageMarkdownProps {
  content: string
  isUser?: boolean
  messageType?: 'chain-of-thought' | 'review-request' | 'review-feedback' | 'default'
  reviewStatus?: 'approved' | 'rejected'
}

export function ChatMessageMarkdown({ 
  content, 
  isUser = false, 
  messageType = 'default',
  reviewStatus
}: ChatMessageMarkdownProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  
  // Determine text color based on message type and theme
  const getTextColorClass = () => {
    if (isUser) return 'text-primary-foreground'
    
    switch (messageType) {
      case 'chain-of-thought':
        return isDark ? 'text-blue-300' : 'text-blue-900'
      case 'review-request':
        return isDark ? 'text-amber-300' : 'text-amber-900'
      case 'review-feedback':
        if (reviewStatus === 'approved') {
          return isDark ? 'text-green-300' : 'text-green-900'
        } else {
          return isDark ? 'text-red-300' : 'text-red-900'
        }
      default:
        return 'text-foreground'
    }
  }
  
  const textColorClass = getTextColorClass()
  
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Headings
        h1: ({ children }) => (
          <h1 className={`text-base font-bold mb-2 mt-3 ${textColorClass}`}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className={`text-sm font-bold mb-1.5 mt-2 ${textColorClass}`}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className={`text-sm font-semibold mb-1 mt-2 ${textColorClass}`}>{children}</h3>
        ),
        
        // Paragraphs
        p: ({ children }) => (
          <p className={`text-sm leading-relaxed mb-2 last:mb-0 ${textColorClass}`}>{children}</p>
        ),
        
        // Lists
        ul: ({ children }) => (
          <ul className={`text-sm mb-2 ml-4 list-disc space-y-1 ${textColorClass}`}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className={`text-sm mb-2 ml-4 list-decimal space-y-1 ${textColorClass}`}>{children}</ol>
        ),
        li: ({ children }) => (
          <li className={`leading-relaxed ${textColorClass}`}>{children}</li>
        ),
        
        // Bold and emphasis
        strong: ({ children }) => (
          <strong className={`font-semibold ${textColorClass}`}>{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        
        // Code
        code: ({ children, className }) => {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match
          
          return isInline ? (
            <code className={`
              px-1.5 py-0.5 rounded text-xs font-mono
              ${isUser ? 'bg-primary-foreground/20 text-primary' : 
                messageType === 'chain-of-thought' ? (isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-900') :
                messageType === 'review-request' ? (isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-100 text-amber-900') :
                messageType === 'review-feedback' ? 
                  (reviewStatus === 'approved' ? 
                    (isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-900') :
                    (isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-100 text-red-900')
                  ) :
                'bg-muted text-foreground'
              }
            `}>
              {children}
            </code>
          ) : (
            <div className="my-2 rounded-md overflow-hidden">
              <SyntaxHighlighter
                style={isDark ? oneDark : tomorrow}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  fontSize: '0.75rem',
                  padding: '0.75rem',
                  backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5',
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            </div>
          )
        },
        
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className={`
            border-l-4 pl-3 my-2 italic text-sm
            ${isUser ? 'border-primary/50 text-primary' : 
              messageType === 'chain-of-thought' ? (isDark ? 'border-blue-500/50 text-blue-300/80' : 'border-blue-300/50 text-blue-700') :
              messageType === 'review-request' ? (isDark ? 'border-amber-500/50 text-amber-300/80' : 'border-amber-300/50 text-amber-700') :
              messageType === 'review-feedback' ? 
                (reviewStatus === 'approved' ? 
                  (isDark ? 'border-green-500/50 text-green-300/80' : 'border-green-300/50 text-green-700') :
                  (isDark ? 'border-red-500/50 text-red-300/80' : 'border-red-300/50 text-red-700')
                ) :
              'border-muted-foreground/30 text-muted-foreground'
            }
          `}>
            {children}
          </blockquote>
        ),
        
        // Links
        a: ({ children, href }) => (
          <a 
            href={href}
            className={`
              underline hover:no-underline text-sm
              ${isUser ? 'text-primary-foreground hover:text-primary-foreground/80' : 'text-primary hover:text-primary/80'}
            `}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        
        // Horizontal rule
        hr: () => (
          <hr className={`
            my-3 border-t
            ${isUser ? 'border-primary-foreground/20' : 'border-muted'}
          `} />
        ),
        
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-sm border-collapse">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className={`${isUser ? 'bg-primary-foreground/10' : 'bg-muted'}`}>
            {children}
          </thead>
        ),
        th: ({ children }) => (
          <th className={`border border-muted px-3 py-1.5 text-left font-semibold ${textColorClass}`}>
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className={`border border-muted px-3 py-1.5 ${textColorClass}`}>
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  )
}