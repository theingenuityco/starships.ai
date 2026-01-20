'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useStarship, useUpdateStarship } from '@/hooks/useStarships'
import api from '@/lib/api'

export interface StarshipDetailsProps {
  starshipId: string
  className?: string
}

/**
 * StarshipDetails
 *
 * Widget that lets a user view/update starship name, description, and website URL.
 * Intended to be rendered inline in chat via widgetType: "StarshipDetails".
 */
export function StarshipDetails({ starshipId, className }: StarshipDetailsProps): React.JSX.Element {
  const { data: starship, isLoading, isError } = useStarship(starshipId, Boolean(starshipId))
  const updateStarship = useUpdateStarship()

  const initial = useMemo(
    () => ({
      name: starship?.name ?? '',
      description: starship?.description ?? '',
      websiteUrl: starship?.websiteUrl ?? '',
    }),
    [starship]
  )

  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  useEffect(() => {
    setName(initial.name)
    setDescription(initial.description)
    setWebsiteUrl(initial.websiteUrl)
  }, [initial.name, initial.description, initial.websiteUrl])

  const canSubmit = Boolean(starshipId) && name.trim().length > 0 && !updateStarship.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    await updateStarship.mutateAsync({
      starshipId,
      updates: {
        name: name.trim(),
        description: description.trim(),
        websiteUrl: websiteUrl.trim(),
      },
    })
  }

  async function onGenerateFromWebsite() {
    const url = websiteUrl.trim()
    if (!starshipId || !url || isGenerating) return
    setGenerateError(null)
    setIsGenerating(true)
    try {
      const res = await api.post(`/api/v1/starships/${starshipId}/generate-description-from-website`, { websiteUrl: url })
      const data: any = (res as any)?.data?.data ?? (res as any)?.data
      const next = typeof data?.description === 'string' ? data.description : ''
      if (!next.trim()) throw new Error('No description returned')
      setDescription(next)
    } catch (err) {
      setGenerateError('Failed to generate description from website.')
    } finally {
      setIsGenerating(false)
    }
  }

  if (!starshipId) {
    return (
      <div className={cn('p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20', className)}>
        <p className="text-sm text-red-600 dark:text-red-400">StarshipDetails: missing required prop starshipId.</p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className={cn('w-full max-w-none', className)}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="starship-name">Name</Label>
          <Input
            id="starship-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aurora"
            disabled={isLoading || updateStarship.isPending}
          />
          {isError ? <div className="text-xs text-red-600 dark:text-red-400">Failed to load starship details.</div> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="starship-website">Website URL</Label>
          <div className="flex gap-2">
            <Input
              id="starship-website"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={isLoading || updateStarship.isPending || isGenerating}
            />
            <Button type="button" variant="outline" onClick={onGenerateFromWebsite} disabled={!websiteUrl.trim() || isGenerating || isLoading}>
              {isGenerating ? 'Generating…' : 'Generate'}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Include <code className="font-mono">http://</code> or <code className="font-mono">https://</code>.
          </div>
          {generateError ? <div className="text-xs text-red-600 dark:text-red-400">{generateError}</div> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="starship-description">Description</Label>
          <Textarea
            id="starship-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what your starship/company/org/project does…"
            disabled={isLoading || updateStarship.isPending || isGenerating}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmit}>
            {updateStarship.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </form>
  )
}

export default StarshipDetails

