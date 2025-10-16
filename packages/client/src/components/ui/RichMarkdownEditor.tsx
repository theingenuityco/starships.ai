'use client'

import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight } from 'lowlight'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import markdown from 'highlight.js/lib/languages/markdown'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// Create a minimal lowlight instance and register languages
const lowlight = createLowlight()
lowlight.register('javascript', javascript)
lowlight.register('typescript', typescript)
lowlight.register('json', json)
lowlight.register('bash', bash)
lowlight.register('markdown', markdown)
lowlight.register('xml', xml)
lowlight.register('yaml', yaml)
import { Markdown } from 'tiptap-markdown'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RichMarkdownEditorProps = {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  className?: string
  minHeightPx?: number
}

export function RichMarkdownEditor({ value, onChange, placeholder = 'Write with Markdown…', className, minHeightPx = 200 }: RichMarkdownEditorProps) {
  const suppressUpdateRef = useRef<boolean>(true)
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
      Placeholder.configure({ placeholder }),
      CodeBlockLowlight.configure({ lowlight }),
      Markdown.configure({
        transformPastedText: true,
        transformCopiedText: true,
        linkify: true,
      }),
    ],
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // Align editor content typography with conversation/body text
        class: cn('tiptap-content focus:outline-none text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words'),
      },
    },
    onUpdate: ({ editor }) => {
      if (suppressUpdateRef.current) return
      try {
        const md = (editor.storage as any)?.markdown?.getMarkdown?.()
        if (typeof md === 'string') onChange(md)
      } catch {}
    },
  })

  useEffect(() => {
    if (!editor) return
    try {
      const md = (editor.storage as any)?.markdown?.getMarkdown?.()
      if (typeof value === 'string' && typeof md === 'string' && value !== md) {
        suppressUpdateRef.current = true
        editor.commands.setContent(value)
        // Allow editor to settle before emitting updates again
        requestAnimationFrame(() => {
          suppressUpdateRef.current = false
        })
      } else if (suppressUpdateRef.current) {
        // Initial mount done; enable updates
        suppressUpdateRef.current = false
      }
    } catch {
      suppressUpdateRef.current = false
    }
  }, [editor, value])

  if (!editor) return null

  return (
    <div className={cn('bg-transparent rounded-none border-none px-0', className)}>
      <BubbleMenu editor={editor}>
        <div className="flex items-center gap-1 rounded-md bg-popover border border-border p-1 shadow-sm">
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBold().run()} className={cn(editor.isActive('bold') && 'bg-muted')}>
            B
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleItalic().run()} className={cn(editor.isActive('italic') && 'bg-muted')}>
            <span className="italic">I</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleStrike().run()} className={cn(editor.isActive('strike') && 'bg-muted')}>
            <span className="line-through">S</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleCode().run()} className={cn(editor.isActive('code') && 'bg-muted')}>
            <code className="text-xs">{`</>`}</code>
          </Button>
          <div className="w-px h-5 bg-border/80 mx-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBulletList().run()} className={cn(editor.isActive('bulletList') && 'bg-muted')}>
            •
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={cn(editor.isActive('orderedList') && 'bg-muted')}>
            1.
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleTaskList().run()} className={cn(editor.isActive('taskList') && 'bg-muted')}>
            [ ]
          </Button>
        </div>
      </BubbleMenu>
      <FloatingMenu editor={editor} shouldShow={({ editor }: any) => editor.isActive('paragraph') || editor.isActive('heading')}>
        <div className="flex items-center gap-1 rounded-md bg-popover border border-border p-1 shadow-sm">
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().setParagraph().run()} className={cn(editor.isActive('paragraph') && 'bg-muted')}>
            P
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(editor.isActive('heading', { level: 1 }) && 'bg-muted')}
          >
            H1
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(editor.isActive('heading', { level: 2 }) && 'bg-muted')}
          >
            H2
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={cn(editor.isActive('heading', { level: 3 }) && 'bg-muted')}
          >
            H3
          </Button>
          <div className="w-px h-5 bg-border/80 mx-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={cn(editor.isActive('blockquote') && 'bg-muted')}>
            ❝
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={cn(editor.isActive('codeBlock') && 'bg-muted')}>
            Code
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            —
          </Button>
          <div className="w-px h-5 bg-border/80 mx-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()}>
            Undo
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()}>
            Redo
          </Button>
        </div>
      </FloatingMenu>
      <EditorContent editor={editor} className="min-h-[200px] px-0 py-2 text-sm leading-relaxed" style={{ minHeight: `${minHeightPx}px` }} />
    </div>
  )
}

export default RichMarkdownEditor
