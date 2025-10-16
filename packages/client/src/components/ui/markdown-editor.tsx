'use client'

import React, { useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownEditorProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeightPx?: number
  showToolbar?: boolean
  borderless?: boolean
  allowPreviewToggle?: boolean
}

export function MarkdownEditor({ id, value, onChange, placeholder, className, minHeightPx = 120, showToolbar = true, borderless = false, allowPreviewToggle = true }: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState<boolean>(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const applyWrap = (prefix: string, suffix?: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const end = suffix ?? prefix
    const { selectionStart, selectionEnd } = textarea
    const before = value.slice(0, selectionStart)
    const selected = value.slice(selectionStart, selectionEnd)
    const after = value.slice(selectionEnd)
    const next = `${before}${prefix}${selected}${end}${after}`
    onChange(next)
    // restore selection roughly around wrapped text
    const cursor = selectionEnd + prefix.length + (suffix ? suffix.length : prefix.length)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  const applyLinePrefix = (marker: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart, selectionEnd } = textarea
    const before = value.slice(0, selectionStart)
    const selected = value.slice(selectionStart, selectionEnd)
    const after = value.slice(selectionEnd)
    const lines = selected.split('\n').map(line => (line.length ? `${marker} ${line}` : marker))
    const next = `${before}${lines.join('\n')}${after}`
    onChange(next)
    requestAnimationFrame(() => textarea.focus())
  }

  return (
    <div className={cn(borderless ? 'rounded-none border-none overflow-visible' : 'rounded-lg border border-border/60 overflow-hidden', className)}>
      {showToolbar && (
        <div className="flex items-center gap-1 p-1.5 bg-muted/40 border-b border-border/60">
          <Button type="button" variant="ghost" size="sm" onClick={() => applyWrap('**')} title="Bold (wrap with **)">
            B
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyWrap('*')} title="Italic (wrap with *)">
            <span className="italic">I</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyWrap('`')} title="Inline code (wrap with `)">
            <code className="text-xs">{`</>`}</code>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyLinePrefix('#')} title="Heading">
            H1
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyLinePrefix('##')} title="Subheading">
            H2
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyLinePrefix('-')} title="Bullet list">
            •
          </Button>
          <div className="flex-1" />
          {allowPreviewToggle && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview(p => !p)}>
              {showPreview ? 'Edit' : 'Preview'}
            </Button>
          )}
        </div>
      )}
      {allowPreviewToggle && showPreview ? (
        <div className={cn('prose prose-sm dark:prose-invert max-w-none bg-background', borderless ? 'p-0' : 'p-3')} style={{ minHeight: `${minHeightPx}px` }}>
          {value?.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown> : <p className="text-xs text-muted-foreground">Nothing to preview</p>}
        </div>
      ) : (
        <Textarea
          id={id}
          ref={textareaRef}
          placeholder={placeholder}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          className={cn('text-sm leading-relaxed resize-y bg-transparent p-0', borderless ? 'border-none focus-visible:ring-0 focus-visible:ring-offset-0' : '')}
          style={{ minHeight: `${minHeightPx}px` }}
        />
      )}
    </div>
  )
}
