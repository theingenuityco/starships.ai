'use client'

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { useTheme } from 'next-themes'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface CodeBlockRendererProps {
  code: string
  language: string
}

export function CodeBlockRenderer({ code, language }: CodeBlockRendererProps) {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  return (
    <div className="relative group">
      {/* Language label and copy button */}
      <div className="flex items-center justify-between bg-muted px-3 py-2 rounded-t-lg border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase">
          {language}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      
      {/* Code content with horizontal scroll */}
      <div className="rounded-b-lg overflow-x-auto max-w-full">
        <SyntaxHighlighter
          language={language}
          style={theme === 'dark' ? oneDark : oneLight}
          customStyle={{
            margin: 0,
            padding: '12px',
            fontSize: '13px',
            lineHeight: '1.4',
            background: 'transparent',
            minWidth: 'max-content',
          }}
          showLineNumbers={code.split('\n').length > 5}
          wrapLines={false}
          wrapLongLines={false}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}