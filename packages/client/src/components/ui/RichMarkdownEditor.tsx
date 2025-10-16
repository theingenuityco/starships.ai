'use client'

import React, { useEffect, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from 'lowlight'
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
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        transformPastedText: true,
        transformCopiedText: true,
        linkify: true,
      }),
    ],
    content: value || '',
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
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
        editor.commands.setContent(value)
      }
    } catch {}
  }, [editor, value])

  if (!editor) return null

  const toggle = (fn: () => void) => fn()

  return (
    <div className={cn('rounded-lg border border-border/60 bg-card', className)}>
      <div className="flex flex-wrap items-center gap-1 p-1.5 border-b border-border/60 bg-muted/40">
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBold().run()} disabled={!editor.can().chain().focus().toggleBold().run()}>
          B
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleItalic().run()} disabled={!editor.can().chain().focus().toggleItalic().run()}>
          <span className="italic">I</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleStrike().run()} disabled={!editor.can().chain().focus().toggleStrike().run()}>
          <span className="line-through">S</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleCode().run()} disabled={!editor.can().chain().focus().toggleCode().run()}>
          <code className="text-xs">{`</>`}</code>
        </Button>
        <div className="w-px h-5 bg-border/80 mx-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().setParagraph().run()}>
          P
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </Button>
        <div className="w-px h-5 bg-border/80 mx-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • List
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. List
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleTaskList().run()}>
          [ ] Task
        </Button>
        <div className="w-px h-5 bg-border/80 mx-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          ❝
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          Code
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          —
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()}>
            Undo
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()}>
            Redo
          </Button>
        </div>
      </div>
      <div className="p-3">
        <EditorContent editor={editor} className="prose prose-sm dark:prose-invert max-w-none min-h-[200px]" style={{ minHeight: `${minHeightPx}px` }} />
      </div>
    </div>
  )
}

export default RichMarkdownEditor
