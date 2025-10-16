'use client'

import React, { useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTheme } from 'next-themes'
import { getMarkdownComponents } from '@/components/markdown/markdownComponents'

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
  // When true, render Markdown live underneath the input in the same surface
  renderWhileEditing?: boolean
}

export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder,
  className,
  minHeightPx = 120,
  showToolbar = true,
  borderless = false,
  allowPreviewToggle = true,
  renderWhileEditing = false,
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState<boolean>(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { theme } = useTheme()

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

  // WYSIWYG mode removed: keeping overlay/live-render markdown editor only

  // Overlay mode: render markdown and editable textarea in the same surface
  if (renderWhileEditing) {
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
          </div>
        )}
        <div className={cn('relative', borderless ? '' : 'bg-background')} style={{ minHeight: `${minHeightPx}px` }}>
          {/* Rendered markdown underneath */}
          <div className={cn('pointer-events-none', borderless ? 'p-0' : 'p-3')} aria-hidden>
            {value?.trim() ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={getMarkdownComponents({ theme, enableLinkPreview: true })}>
                  {value}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{placeholder || 'Write with Markdown…'}</p>
            )}
          </div>
          {/* Transparent textarea on top capturing input */}
          <Textarea
            id={id}
            ref={textareaRef}
            placeholder={placeholder}
            value={value}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
            className={cn(
              // Make text transparent so the rendered markdown is visible; keep caret visible
              'absolute inset-0 w-full h-full bg-transparent text-transparent caret-foreground selection:bg-primary/20 resize-none',
              borderless ? 'border-none focus-visible:ring-0 focus-visible:ring-offset-0' : ''
            )}
            // Ensure the textarea overlays the rendered markdown and matches padding for correct caret position
            style={{ minHeight: `${minHeightPx}px`, padding: borderless ? undefined : '0.75rem' }}
          />
        </div>
      </div>
    )
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
        <div className={cn('bg-background', borderless ? 'p-0' : 'p-3')} style={{ minHeight: `${minHeightPx}px` }}>
          {value?.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={getMarkdownComponents({ theme, enableLinkPreview: true })}>
                {value}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing to preview</p>
          )}
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
