'use client'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { STARSHIP_QUERY_KEYS, useUpdateStarship } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { PROFILE_SECTION_CARD_CLASS } from '@/components/profile/profileCardClasses'
import type { ShipClass, StarshipModel, StarshipStatus, UpdateStarshipRequest } from '@starships/protocol'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { StarshipUpgradeSection } from '@/components/settings/StarshipUpgradeSection'

interface MyStarshipSettingsSectionProps {
  starship?: StarshipModel
  starshipSlug: string
  isLoading?: boolean
}

const shipClassLabels: Record<ShipClass, string> = {
  scout: 'Scout',
  frigate: 'Frigate',
  cruiser: 'Cruiser',
}

const statusLabels: Record<StarshipStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
}

function formatHumanDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function MyStarshipSettingsSection({ starship, starshipSlug, isLoading = false }: MyStarshipSettingsSectionProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { userId, userName, userAvatar, isInstanceAdmin } = useAuth()
  const updateStarship = useUpdateStarship()

  const { data: deployedAgents, isLoading: isAgentsLoading } = useStarshipAgents(starship?.id ?? '', Boolean(starship?.id))
  const deployedAgentsCount = Array.isArray(deployedAgents) ? deployedAgents.length : 0
  const maxAgentsLabel = isAgentsLoading ? `…/${starship?.maxAgents ?? '—'}` : `${deployedAgentsCount}/${starship?.maxAgents ?? '—'}`

  const canEdit = useMemo(() => {
    if (!starship) return false
    return Boolean(isInstanceAdmin || (userId && starship.ownerId === userId))
  }, [starship, isInstanceAdmin, userId])

  const [form, setForm] = useState<{
    name: string
  } | null>(null)

  useEffect(() => {
    if (!starship) return
    setForm({
      name: starship.name,
    })
  }, [starship])

  const generatedSlug = useMemo(() => {
    if (!form?.name) return starship?.slug ?? ''
    return generateSlug(form.name)
  }, [form?.name, starship?.slug])

  const nameChanged = Boolean(starship && form && form.name.trim() && form.name.trim() !== starship.name)

  const updates: UpdateStarshipRequest | null = useMemo(() => {
    if (!starship || !form) return null

    const next: UpdateStarshipRequest = {}
    if (form.name.trim() && form.name.trim() !== starship.name) next.name = form.name.trim()

    // Slug is auto-generated on the server (and may get a unique suffix if taken),
    // so we intentionally do NOT set `next.slug` here. We only show an "expected base slug" in the UI.

    return Object.keys(next).length ? next : null
  }, [starship, form])

  const isSaving = updateStarship.isPending
  const dirty = Boolean(updates)
  const formId = 'starship-settings-form'

  const resetForm = () => {
    if (!starship) return
    setForm({
      name: starship.name,
    })
  }

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!starship || !updates) return

    try {
      const updated = await updateStarship.mutateAsync({ starshipId: starship.id, updates })

      // `useUpdateStarship` updates the ID-based cache; keep the slug-based cache fresh too.
      queryClient.invalidateQueries({
        queryKey: [...STARSHIP_QUERY_KEYS.all, 'slug', starshipSlug] as const,
      })

      // If slug changed, redirect to the new canonical URL.
      if (updated.slug && updated.slug !== starshipSlug) {
        router.replace(`/ship/${updated.slug}/settings/my-starship`)
      }
    } catch {
      // `useUpdateStarship` already surfaces errors via toast; keep UI stable.
    }
  }

  if (isLoading) {
    return (
      <Card className={PROFILE_SECTION_CARD_CLASS}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="rocket" className="h-4 w-4 text-primary" />
            My starship
          </CardTitle>
          <CardDescription className="text-sm">Loading starship…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!starship) {
    return (
      <Alert>
        <Icon name="info" className="h-4 w-4" />
        <AlertDescription>Starship not found. Please check the URL and try again.</AlertDescription>
      </Alert>
    )
  }

  return (
    <>
      {/* Match Profile layout: sticky top bar + two-column cards */}
      <div className={`sticky top-0 z-10 p-4 ${PROFILE_SECTION_CARD_CLASS}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Icon name="rocket" className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">My starship</h2>
            <p className="text-sm text-muted-foreground">Manage your starship’s identity and limits.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {dirty ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600">
                <Icon name="check-circle" className="h-3.5 w-3.5" /> Up to date
              </span>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={resetForm} disabled={!dirty || !canEdit}>
              Reset
            </Button>
            <Button type="submit" form={formId} className="px-4" disabled={!dirty || isSaving || !canEdit}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>

      <form id={formId} onSubmit={onSave} className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,_1fr)] xl:items-start">
        {starship.id && (
          <div className="xl:col-span-2">
            <StarshipUpgradeSection starshipId={starship.id} />
          </div>
        )}

        {/* Left column: overview */}
        <div className="space-y-6">
          <Card className={PROFILE_SECTION_CARD_CLASS}>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Starship overview</CardTitle>
              <CardDescription className="text-sm">Quick snapshot of this ship.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-lg font-semibold leading-tight">{starship.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">/{starship.slug}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Icon name="users" className="h-3.5 w-3.5" />
                    Agents Deployed
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums">{maxAgentsLabel}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Icon name="zap" className="h-3.5 w-3.5" />
                    Parallel Tasks
                  </div>
                  <div className="mt-1 text-sm font-semibold">{starship.maxConcurrentTurns}</div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <div className="space-y-2">
                  <div className="flex h-6 items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">Ship class</span>
                    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-border/60 bg-muted/20 px-2 text-[11px] font-medium">
                      <Icon name="layers" className="h-3.5 w-3.5 text-muted-foreground" />
                      {shipClassLabels[starship.shipClass]}
                    </span>
                  </div>
                  <div className="flex h-6 items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <span
                      className={[
                        'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium',
                        starship.status === 'active' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-border/60 bg-muted/20 text-muted-foreground',
                      ].join(' ')}
                    >
                      <span className={['h-1.5 w-1.5 rounded-full', starship.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/60'].join(' ')} />
                      {statusLabels[starship.status]}
                    </span>
                  </div>
                  <div className="flex h-6 items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">Owner</span>
                    {starship.ownerId === userId ? (
                      <div className="flex h-6 items-center gap-2">
                        <Avatar className="h-5 w-5 rounded-full">
                          {typeof userAvatar === 'string' && /^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(userAvatar.trim()) ? (
                            <AvatarImage src={userAvatar.trim()} alt={userName || 'Owner'} />
                          ) : null}
                          <AvatarFallback className="rounded-full text-[9px] leading-none">
                            {typeof userAvatar === 'string' && userAvatar.trim() && !/^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(userAvatar.trim())
                              ? userAvatar.trim()
                              : (userName || 'You').slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{userName || 'You'}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium">—</span>
                    )}
                  </div>
                  <div className="flex h-6 items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">Created</span>
                    <span className="text-xs font-medium tabular-nums">{formatHumanDateTime(starship.createdAt)}</span>
                  </div>
                  <div className="flex h-6 items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">Updated</span>
                    <span className="text-xs font-medium tabular-nums">{formatHumanDateTime(starship.updatedAt)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: editable details */}
        <div className="space-y-6">
          {!canEdit && (
            <Alert>
              <Icon name="lock" className="h-4 w-4" />
              <AlertDescription>You don’t have permission to edit this starship.</AlertDescription>
            </Alert>
          )}

          <Card className={PROFILE_SECTION_CARD_CLASS}>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="id-card" className="h-4 w-4 text-primary" />
                Starship details
              </CardTitle>
              <CardDescription className="text-sm">Update your starship name.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="starship-name">Name</Label>
                  <div className="relative">
                    <Input
                      id="starship-name"
                      value={form?.name ?? starship.name}
                      onChange={e => setForm(prev => (prev ? { ...prev, name: e.target.value } : prev))}
                      disabled={!canEdit || isSaving}
                      placeholder="Starship name"
                      className="pr-9"
                    />
                    <Icon name="type" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  {nameChanged ? (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        After you save, your starship URL will be <span className="font-mono">/ship/{generatedSlug}-xxxxxx</span>.
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Your starship URL is <span className="font-mono">/ship/{starship.slug}</span>
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </>
  )
}
