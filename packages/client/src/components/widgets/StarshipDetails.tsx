'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { useStarship, useUpdateStarship } from '@/hooks/useStarships'
import api from '@/lib/api'
import Icon from '@/components/primitives/Icon'
import { Orbitron } from 'next/font/google'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

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

  function generateSlug(value: string): string {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

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
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const [logoTrigger, setLogoTrigger] = useState(0)
  const logoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setName(initial.name)
    setDescription(initial.description)
    setWebsiteUrl(initial.websiteUrl)
  }, [initial.name, initial.description, initial.websiteUrl])

  // Auto-expand description textarea to fit content
  useEffect(() => {
    const el = descriptionRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [description])

  // Delay logo entry animation a bit after mount (feels more premium + less distracting)
  useEffect(() => {
    // Ensure we never leave a dangling timer around (StrictMode remounts, fast navigation, etc.)
    if (logoTimeoutRef.current) clearTimeout(logoTimeoutRef.current)
    logoTimeoutRef.current = setTimeout(() => setLogoTrigger(v => v + 1), 2000)
    return () => {
      if (logoTimeoutRef.current) clearTimeout(logoTimeoutRef.current)
      logoTimeoutRef.current = null
    }
  }, [])

  const descriptionMax = 2000
  const descriptionCount = description.length
  const descriptionRemaining = Math.max(0, descriptionMax - descriptionCount)
  const nameChanged = Boolean(starship && name.trim() && name.trim() !== starship.name)
  const generatedSlug = useMemo(() => generateSlug(name), [name])
  const logoGradientId = useMemo(() => {
    const raw = `starship-details-logo-${String(starshipId || '')}`
    return raw.replace(/[^a-zA-Z0-9_-]/g, '')
  }, [starshipId])

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
    <Card
      className={cn(
        // Distinct "starships" card: premium surface + nebula accents, but still fits inside chat.
        // Match AgentTemplateCard shadow convention: shadow-sm → hover:shadow-md
        'group relative w-full max-w-[760px] overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-sm',
        'transition-all duration-200 hover:bg-card/70 hover:shadow-md',
        className
      )}
    >
      {/* Subtle accent without a "header" */}
      {/* Subtle glow that works in both light + dark (different tuning per theme) */}
      <div className="pointer-events-none absolute inset-0 dark:hidden bg-[radial-gradient(circle_at_18%_0%,rgba(99,102,241,0.10),transparent_58%),radial-gradient(circle_at_88%_18%,rgba(34,211,238,0.08),transparent_60%),radial-gradient(circle_at_30%_112%,rgba(16,185,129,0.06),transparent_62%),radial-gradient(circle_at_55%_0%,rgba(245,158,11,0.06),transparent_64%)]" />
      <div className="pointer-events-none absolute inset-0 hidden dark:block bg-[radial-gradient(circle_at_18%_0%,rgba(168,85,247,0.16),transparent_54%),radial-gradient(circle_at_88%_18%,rgba(34,211,238,0.12),transparent_56%),radial-gradient(circle_at_30%_112%,rgba(16,185,129,0.09),transparent_60%),radial-gradient(circle_at_55%_0%,rgba(245,158,11,0.10),transparent_62%)]" />

      <CardContent className="relative p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <StarshipsLogo width={44} height={44} gradientId={logoGradientId} idleLoop={false} playOnMountOnce={false} triggerAnimation={logoTrigger} animationDelay={0} activeStroke="gradient" />
          <div className="min-w-0">
            <div className={`${orbitron.className} text-2xl sm:text-3xl font-semibold leading-none tracking-tight`}>My Starship</div>
          </div>
          <div className="ml-auto">
            <Button type="submit" form="starship-details-form" disabled={!canSubmit} className="shadow-sm">
              {updateStarship.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <form id="starship-details-form" onSubmit={onSubmit} className="w-full max-w-none">
          {/* OUTER GROUP: (inputs group: flex-1) + (draft button: auto width) */}
          <div className="mt-4 space-y-4">
            <div className="flex gap-2 items-start">
              {/* INNER GROUP: two inputs share width 50/50 */}
              <div className="flex-1">
                <div className="flex gap-2">
                  <div className="w-1/2 space-y-2">
                    <Label htmlFor="starship-name" className="text-xs text-muted-foreground">
                      Starship name
                    </Label>
                    <div className="relative">
                      <Input
                        id="starship-name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Starship name"
                        disabled={isLoading || updateStarship.isPending}
                        className="pr-9 ring-1 ring-transparent focus-visible:ring-primary/25"
                      />
                      <Icon name="type" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    {isError ? <div className="text-xs text-red-600 dark:text-red-400">Failed to load starship details.</div> : null}
                    {starship ? <div className="text-[11px] text-muted-foreground">{nameChanged ? <>/ship/{generatedSlug}-xxxxxx</> : <>/ship/{starship.slug}</>}</div> : null}
                  </div>

                  <div className="w-1/2 space-y-2">
                    <Label htmlFor="starship-website" className="text-xs text-muted-foreground">
                      Website
                    </Label>
                    <Input
                      id="starship-website"
                      value={websiteUrl}
                      onChange={e => setWebsiteUrl(e.target.value)}
                      placeholder="https://example.com"
                      disabled={isLoading || updateStarship.isPending || isGenerating}
                      className="ring-1 ring-transparent focus-visible:ring-primary/25"
                    />
                    <div className="text-xs text-muted-foreground">Include http:// or https://</div>
                    {generateError ? <div className="text-xs text-red-600 dark:text-red-400">{generateError}</div> : null}
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={onGenerateFromWebsite}
                disabled={!websiteUrl.trim() || isGenerating || isLoading}
                className={cn(
                  'h-10 shrink-0 border-border/60 bg-card/50 backdrop-blur-sm',
                  // Manual spacing from top (accounts for label + gap)
                  'mt-[32px]',
                  'hover:bg-card/70'
                )}
              >
                <Icon name={isGenerating ? 'loading' : 'magic-wand'} className={cn('mr-2 h-4 w-4', isGenerating ? 'animate-spin' : '')} />
                {isGenerating ? 'Filling…' : 'Fill bio'}
              </Button>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="starship-description" className="text-xs text-muted-foreground">
                Starship bio
              </Label>
              <Textarea
                id="starship-description"
                ref={descriptionRef}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe what your starship/company/org/project does…"
                disabled={isLoading || updateStarship.isPending || isGenerating}
                className={cn('resize-none overflow-hidden bg-background/60', 'ring-1 ring-transparent focus-visible:ring-primary/25')}
                rows={4}
                maxLength={descriptionMax}
              />
              <div className={cn('text-xs text-muted-foreground', descriptionCount > descriptionMax ? 'text-red-600 dark:text-red-400' : undefined)}>{descriptionRemaining} left</div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default StarshipDetails
