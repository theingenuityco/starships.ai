'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipDocs, useCreateDoc, useUpdateDoc, useHardDeleteDoc } from '@/hooks/useDocs'
import type { StarshipDocModel } from '@starships/protocol'

export default function StarshipDocsPage(): React.JSX.Element {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const router = useRouter()

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id || ''

  const { data: docs, isLoading } = useStarshipDocs(starshipId, Boolean(starshipId))

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StarshipDocModel | null>(null)

  const createDoc = useCreateDoc(starshipId)
  const updateDoc = useUpdateDoc(starshipId, deleteTarget?.id ?? '')
  const hardDeleteDoc = useHardDeleteDoc(starshipId)

  const filtered = (docs ?? []).filter((d) => {
    if (!search.trim()) return !d.archived
    return !d.archived && (d.title.toLowerCase().includes(search.toLowerCase()) || d.slug.toLowerCase().includes(search.toLowerCase()))
  })

  async function handleCreate() {
    if (!createTitle.trim()) return
    try {
      const created = await createDoc.mutateAsync({ title: createTitle.trim() })
      setCreateOpen(false)
      setCreateTitle('')
      router.push(`/ship/${slug}/docs/${created.id}`)
    } catch (e) {
      toast.error('Failed to create doc', { description: getSafeErrorMessage(e) })
    }
  }

  async function handleArchive(doc: StarshipDocModel) {
    try {
      await updateDoc.mutateAsync({ archived: true })
      toast.success(`"${doc.title}" archived`)
    } catch (e) {
      toast.error('Failed to archive doc', { description: getSafeErrorMessage(e) })
    }
  }

  async function handleDelete(doc: StarshipDocModel) {
    try {
      await hardDeleteDoc.mutateAsync(doc.id)
      setDeleteTarget(null)
      toast.success(`"${doc.title}" deleted`)
    } catch (e) {
      toast.error('Failed to delete doc', { description: getSafeErrorMessage(e) })
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon="file-text"
        title="Docs"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" className="w-4 h-4 mr-1.5" />
            New doc
          </Button>
        }
      />

      {/* Search */}
      <div className="px-4 py-3 border-b shrink-0">
        <Input
          placeholder="Search docs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <Icon name="file-text" className="w-8 h-8 opacity-40" />
            <p className="text-sm">{search ? 'No docs match your search' : 'No docs yet — create one to get started'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors group'
                )}
              >
                <Icon name="file-text" className="w-4 h-4 text-muted-foreground shrink-0" />
                <Link href={`/ship/${slug}/docs/${doc.id}`} className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{doc.slug}</p>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-7 w-7 shrink-0">
                      <Icon name="ellipsis" className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/ship/${slug}/docs/${doc.id}`}>Open</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleArchive(doc)} className="text-muted-foreground">
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleteTarget(doc)} className="text-destructive">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New doc</DialogTitle>
            <DialogDescription>Give your doc a title. You can add content in the editor.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Doc title"
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!createTitle.trim() || createDoc.isPending}>
              {createDoc.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteTarget?.title}&rdquo;?</DialogTitle>
            <DialogDescription>This action cannot be undone. The doc will be permanently removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={hardDeleteDoc.isPending}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {hardDeleteDoc.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
