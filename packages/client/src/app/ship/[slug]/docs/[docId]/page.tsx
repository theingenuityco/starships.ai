'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useDoc, useUpdateDoc } from '@/hooks/useDocs'

export default function DocEditorPage(): React.JSX.Element {
  const { slug: slugParam, docId: docIdParam } = useParams<{ slug: string; docId: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const docId = typeof docIdParam === 'string' ? docIdParam : ''

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id || ''

  const { data: doc, isLoading } = useDoc(starshipId, docId, Boolean(starshipId) && Boolean(docId))

  const updateDoc = useUpdateDoc(starshipId, docId)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (doc) {
      setTitle(doc.title)
      setContent(doc.content)
      setDirty(false)
    }
  }, [doc])

  const scheduleSave = useCallback(
    (nextTitle: string, nextContent: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await updateDoc.mutateAsync({ title: nextTitle, content: nextContent })
        } catch (e) {
          toast.error('Failed to save', { description: getSafeErrorMessage(e) })
        }
      }, 1000)
    },
    [updateDoc]
  )

  function handleTitleChange(value: string) {
    setTitle(value)
    setDirty(true)
    scheduleSave(value, content)
  }

  function handleContentChange(value: string) {
    setContent(value)
    setDirty(true)
    scheduleSave(title, value)
  }

  async function handleSaveNow() {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    try {
      await updateDoc.mutateAsync({ title, content })
      setDirty(false)
      toast.success('Saved')
    } catch (e) {
      toast.error('Failed to save', { description: getSafeErrorMessage(e) })
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-40 rounded" />
        </div>
        <div className="p-4 space-y-3">
          <Skeleton className="h-9 w-full max-w-lg rounded" />
          <Skeleton className="h-64 w-full rounded" />
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <Icon name="file-text" className="w-8 h-8 opacity-40" />
        <p>Doc not found</p>
        <Link href={`/ship/${slug}/docs`} className="text-sm underline">Back to docs</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <MobileNavToggleButton />
        <Link href={`/ship/${slug}/docs`} className="text-muted-foreground hover:text-foreground transition-colors">
          <Icon name="arrow-left" className="w-4 h-4" />
        </Link>
        <Icon name="file-text" className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium truncate max-w-[200px]">{doc.title}</span>
        <div className="flex-1" />
        {dirty && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
        <Button size="sm" variant="outline" onClick={handleSaveNow} disabled={updateDoc.isPending || !dirty}>
          {updateDoc.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
        <Input
          className="text-xl font-semibold border-0 shadow-none px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Untitled"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
        />

        <Tabs defaultValue="write" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-fit">
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="write" className="flex-1 min-h-0 mt-2">
            <textarea
              className={cn(
                'w-full h-full resize-none rounded-md border bg-background px-3 py-2 text-sm font-mono',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
                'placeholder:text-muted-foreground/50'
              )}
              placeholder="Write markdown here…"
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
            />
          </TabsContent>

          <TabsContent value="preview" className="flex-1 min-h-0 mt-2 overflow-auto">
            <MarkdownPreview content={content} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-muted-foreground text-sm italic">Nothing to preview yet.</p>
  }

  // Simple markdown-to-HTML renderer for headings, bold, italic, code, links, and paragraphs.
  // A full library (react-markdown) can replace this if added to dependencies.
  const html = renderMarkdown(content)

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inCodeBlock = false
  let codeLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (hMatch) {
      const level = hMatch[1]!.length
      out.push(`<h${level}>${inlineMarkdown(hMatch[2]!)}</h${level}>`)
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      out.push('<hr />')
      continue
    }

    // Blank line → paragraph break
    if (!line.trim()) {
      out.push('')
      continue
    }

    out.push(`<p>${inlineMarkdown(line)}</p>`)
  }

  if (inCodeBlock && codeLines.length > 0) {
    out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  }

  return out.join('\n')
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
}
