'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HoverProfilePopover } from '@/components/conversation/HoverProfilePopover'
import { UserProfileHoverCardContent } from '@/components/conversation/ProfileHoverCardContent'
import type { StarshipInviteListItem, StarshipMemberListItem, StarshipMembersAndInvitesPage } from '@/hooks/useStarshipMembers'
import { STARSHIP_MEMBERS_QUERY_KEYS, useInfiniteStarshipMembers, useRemoveStarshipMember, useRevokeStarshipInvite } from '@/hooks/useStarshipMembers'
import { useCreateStarshipInvite } from '@/hooks/useStarshipInvites'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipPresence } from '@/hooks/useStarshipPresence'
import { useAuth } from '@/hooks/useAuth'
import { useQueryClient } from '@tanstack/react-query'
import { isImageUrl } from '@/lib/isImageUrl'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { MobileBottomFilterBar } from '@/components/layout/MobileBottomFilterBar'

type Filter = 'all' | 'humans'

const SKELETON_CARD_COUNT = 2

function initialsFromName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'U'
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return 'U'
  return (
    parts
      .map(p => p[0]?.toUpperCase())
      .filter(Boolean)
      .join('') || 'U'
  )
}

function formatMemberRoleLabel(role?: string | null): string {
  const r = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (!r) return ''
  if (r === 'owner') return 'Owner'
  if (r === 'admin') return 'Admin'
  if (r === 'collaborator') return 'Collaborator'
  return r.replace(/\b\w/g, c => c.toUpperCase())
}

function getUserLabel(m: StarshipMemberListItem): { primary: string; secondary?: string } {
  const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : ''
  const email = typeof m.email === 'string' ? m.email.trim() : ''
  const primary = displayName || email || 'Unknown member'
  const role = typeof m.role === 'string' ? m.role.trim() : ''
  const secondaryParts = [role ? role[0]?.toUpperCase() + role.slice(1) : null, displayName && email ? email : null].filter(Boolean) as string[]
  return { primary, secondary: secondaryParts.length ? secondaryParts.join(' · ') : undefined }
}

export default function MembersPage() {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const { user, isInstanceAdmin } = useAuth()
  const queryClient = useQueryClient()
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ?? null
  const starshipIdStr = starshipId ? String(starshipId) : null

  const [filter, setFilter] = useState<Filter>('all')
  const [searchText, setSearchText] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  const SEARCH_DEBOUNCE_MS = 400
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [SEARCH_DEBOUNCE_MS, searchText])

  useEffect(() => {
    if (!inviteOpen) return
    setInviteEmail('')
    setLastInviteUrl(null)
  }, [inviteOpen])

  const humansQuery = useInfiniteStarshipMembers(String(starshipId || ''), Boolean(starshipId), { limit: 50, search: debouncedSearch })

  const humans = useMemo(() => {
    const pages: StarshipMembersAndInvitesPage[] = humansQuery.data?.pages ?? []
    return pages.flatMap(p => p.members)
  }, [humansQuery.data])

  const invites = useMemo(() => {
    const pages: StarshipMembersAndInvitesPage[] = humansQuery.data?.pages ?? []
    return pages.flatMap(p => p.invites)
  }, [humansQuery.data])

  const presence = useStarshipPresence(starshipIdStr ?? '', Boolean(starshipIdStr))
  const removeMember = useRemoveStarshipMember(starshipIdStr ?? '')
  const revokeInvite = useRevokeStarshipInvite(starshipIdStr ?? '')
  const createInvite = useCreateStarshipInvite(starshipIdStr ?? '')

  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'kickHuman'; userId: string; label: string }
    | { kind: 'revokeInvite'; email: string; label: string }
    | null
  >(null)

  const renderHumanRow = (m: StarshipMemberListItem) => {
    const label = getUserLabel(m)
    const userId = typeof m.userId === 'string' ? m.userId.trim() : ''
    const isOnline = presence.isUserOnline(userId)
    const avatarUrlRaw = typeof m.avatar === 'string' ? m.avatar.trim() : ''
    const avatarUrl = isImageUrl(avatarUrlRaw) ? avatarUrlRaw : null
    const presenceText = isOnline ? 'Online' : 'Offline'
    const isAuthedUser = Boolean(user?.id && userId && String(user.id) === String(userId))
    const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : ''
    const email = typeof m.email === 'string' ? m.email.trim() : ''
    const userHoverTitle = isAuthedUser ? 'You' : label.primary
    const userHoverSub = isAuthedUser ? displayName || email || '' : email && email !== label.primary ? email : ''
    const userHoverCard = (
      <UserProfileHoverCardContent
        title={userHoverTitle}
        subtitle={userHoverSub || undefined}
        isAuthedUser={isAuthedUser}
        explicitAvatarUrl={avatarUrl || undefined}
        resolvedAvatarUrl={undefined}
        avatarSeed={label.primary || undefined}
        fallbackInitials={initialsFromName(userHoverTitle || email || displayName || label.primary)}
        fallbackVariant="initials"
        userIdShort={userId ? `#${userId.slice(0, 6)}` : undefined}
        email={email || undefined}
        roleLabel={formatMemberRoleLabel(m.role) || undefined}
        memberSince={m.createdAt || undefined}
        statusLabel={presenceText}
      />
    )
    const chatHref = !isAuthedUser && slug ? `/ship/${encodeURIComponent(slug)}/rooms/lobby` : null
    const canKick = Boolean(!isAuthedUser && m.role !== 'owner' && userId)
    return (
      <div key={userId || `${label.primary}-${label.secondary || ''}`} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1')} aria-label={label.primary}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <AgentAvatar seed={label.primary} imageUrl={avatarUrl} fill instanceId={userId ? `member-u-${userId}` : `member-u-${label.primary}`} rounded />
              </span>
              <PresenceIndicator
                kind={isOnline ? 'online' : 'offline'}
                active={true}
                size="sm"
                placement="outset"
                className="translate-x-[22%] translate-y-[6%]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <HoverProfilePopover
                  trigger={
                    <button type="button" className={cn('block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline underline-offset-2')}>
                      {label.primary}
                    </button>
                  }
                  content={userHoverCard}
                  side="right"
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className={cn('truncate', isOnline ? 'text-emerald-600 dark:text-emerald-400' : undefined)}>{presenceText}</span>
                {label.secondary ? <span aria-hidden="true">·</span> : null}
                {label.secondary ? <span className="truncate">{label.secondary}</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-center">
          {chatHref ? (
            <Button asChild size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-accent/80 hover:text-foreground">
              <Link href={chatHref} className="inline-flex items-center gap-1.5">
                <Icon name="message-square" className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground" aria-label="More options">
                <Icon name="dots-vertical" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canKick ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'kickHuman', userId, label: label.primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="x-circle" className="h-4 w-4" />
                  Kick
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No actions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const renderInviteRow = (inv: StarshipInviteListItem) => {
    const emailRaw = typeof inv.invitedEmail === 'string' ? inv.invitedEmail.trim() : ''
    const roleRaw = typeof inv.role === 'string' ? inv.role.trim() : ''
    const roleLabel = roleRaw ? roleRaw[0]?.toUpperCase() + roleRaw.slice(1) : ''
    const key = emailRaw ? `invite-${emailRaw}` : `invite-${inv.createdAt}`
    const primary = emailRaw || 'Invited member'
    const canRevoke = Boolean(canInviteUsers && emailRaw)
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1 outline-none rounded-md')} aria-label={primary}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <AgentAvatar seed={primary} imageUrl={null} fill instanceId={key} rounded />
              </span>
              <PresenceIndicator kind="offline" active={true} size="sm" placement="outset" className="translate-x-[22%] translate-y-[6%]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate text-foreground')}>{primary}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">Invited</span>
                {roleLabel ? <span aria-hidden="true">·</span> : null}
                {roleLabel ? <span className="truncate">{roleLabel}</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground" aria-label="More options">
                <Icon name="dots-vertical" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canRevoke ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'revokeInvite', email: emailRaw, label: primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="x-circle" className="h-4 w-4" />
                  Revoke
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No actions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const q = debouncedSearch

  const canLoadMoreHumans = Boolean(humansQuery.hasNextPage)
  const isLoadingMoreHumans = Boolean(humansQuery.isFetchingNextPage)

  const isInitialLoading = !q && Boolean(humansQuery.isLoading)
  const isSearching = Boolean(q && (humansQuery.isLoading || (humansQuery.isFetching && !isLoadingMoreHumans)))

  const humansCount = humans.length
  const invitesCount = invites.length

  const renderCenteredState = (message: string) => {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-muted-foreground text-center">{message}</p>
      </div>
    )
  }

  const onlineVisibleHumansCount = useMemo(() => {
    let n = 0
    for (const m of humans) {
      const userId = typeof (m as any)?.userId === 'string' ? String((m as any).userId).trim() : ''
      if (!userId) continue
      if (presence.isUserOnline(userId)) n += 1
    }
    return n
  }, [humans, presence])

  const canInviteUsers = Boolean(starship?.id && (isInstanceAdmin === true || (user?.id && starship?.ownerId && String(starship.ownerId) === String(user.id))))

  const isFilterValue = (value: string): value is Filter => value === 'all' || value === 'humans'
  const openInviteFlow = () => setInviteOpen(true)

  const humansTabCount = humansCount + invitesCount
  const allTabCount = humansTabCount

  const mobileFilterOptions = useMemo(() => {
    const withCount = (label: string, n: number) => `${label} (${n})`
    return [
      { value: 'all', label: withCount('All', allTabCount) },
      { value: 'humans', label: withCount('Humans', humansTabCount) },
    ]
  }, [allTabCount, humansTabCount])

  const renderMemberCardSkeleton = (key: string) => {
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <Skeleton className="h-10 w-10 rounded-full" />
              {/* Presence dot placeholder to keep spacing stable */}
              <Skeleton className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40 max-w-[70%]" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <MobileNavToggleButton className="mx-2" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex items-baseline gap-2 min-w-0 w-full">
                      <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                        <Icon name="users" weight="bold" className="h-4 w-4" />
                      </span>
                      <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Members</h3>
                    </div>

                    <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                      <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground" title="Invite collaborators and manage roles on your starship.">
                        Invite collaborators and manage roles on your starship.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pt-4 pb-8 hidden md:block">
            <Tabs
              value={filter}
              onValueChange={value => {
                if (isFilterValue(value)) setFilter(value)
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex justify-start">
                  <TabsList className="w-full sm:w-auto flex-nowrap justify-center sm:justify-start gap-1 overflow-x-auto custom-scrollbar">
                    <TabsTrigger value="all" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>All</span>
                        {!isInitialLoading ? (
                          <Badge variant={filter === 'all' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {allTabCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="humans" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Humans</span>
                        {!isInitialLoading ? (
                          <Badge variant={filter === 'humans' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {humansTabCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="w-full sm:w-64">
                  <div className="relative">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      placeholder="Search members"
                      className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                      aria-label="Search members"
                    />
                  </div>
                </div>
              </div>
            </Tabs>
          </div>

          {isInitialLoading ? (
            <div className="space-y-10">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-baseline gap-3">
                    <h3 className="text-lg font-semibold leading-tight text-foreground">Humans</h3>
                    <Skeleton className="h-4 w-8" />
                  </div>
                  {slug && canInviteUsers ? (
                    <Button type="button" size="sm" variant="ghost" className="h-8 text-primary hover:text-primary" onClick={openInviteFlow}>
                      <Icon name="user-plus" iconOverride={{ type: 'phosphor', component: 'UserPlus' }} className="h-4 w-4 mr-1.5" />
                      Invite user
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-2">{Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => renderMemberCardSkeleton(`human-skel-${i}`))}</div>
              </div>
            </div>
          ) : isSearching ? (
            renderCenteredState(`Searching “${q}”…`)
          ) : humans.length === 0 && invites.length === 0 ? (
            renderCenteredState(q ? `No members match “${q}”.` : 'No members found.')
          ) : (
            <div className="space-y-10">
              {humans.length > 0 || invites.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Humans</h3>
                      <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">({onlineVisibleHumansCount} online)</span>
                    </div>
                    {slug && canInviteUsers ? (
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-primary hover:text-primary" onClick={openInviteFlow}>
                        <Icon name="user-plus" iconOverride={{ type: 'phosphor', component: 'UserPlus' }} className="h-4 w-4 mr-1.5" />
                        Invite user
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {humans.map(renderHumanRow)}
                    {invites.map(renderInviteRow)}
                  </div>
                  {canLoadMoreHumans ? (
                    <div className="flex justify-center pt-4">
                      <Button variant="secondary" onClick={() => humansQuery.fetchNextPage()} disabled={isLoadingMoreHumans} className="h-8">
                        {isLoadingMoreHumans ? 'Loading…' : 'Load more humans'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <MobileBottomFilterBar
        filterValue={filter}
        onFilterChange={v => {
          if (isFilterValue(v)) setFilter(v)
        }}
        filterOptions={mobileFilterOptions}
        filterPlaceholder="Filter"
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Search members"
      />

      <Dialog
        open={inviteOpen}
        onOpenChange={open => {
          setInviteOpen(open)
          if (open) {
            setInviteEmail('')
            setLastInviteUrl(null)
          } else {
            setLastInviteUrl(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Invite collaborator</DialogTitle>
            <DialogDescription>Send an invite link to a teammate.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teammate@example.com" disabled={createInvite.isPending} />
            </div>
            {lastInviteUrl ? (
              <div className="max-w-full overflow-hidden rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Icon name="check-circle" className="h-4 w-4 text-emerald-700 dark:text-emerald-400 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">We have sent them an invite. You can also use this invite link:</p>
                    <div className="relative min-w-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                        aria-label="Copy invite link"
                        title="Copy invite link"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(lastInviteUrl)
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        <Icon name="copy" className="h-4 w-4" />
                      </Button>
                      <code className="block min-w-0 break-all rounded-md border border-border/60 bg-card/60 px-2 py-2 pr-9 text-[12px]">{lastInviteUrl}</code>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)} disabled={createInvite.isPending}>
              Close
            </Button>
            <Button
              type="button"
              disabled={!canInviteUsers || !starshipIdStr || !inviteEmail.trim() || createInvite.isPending}
              onClick={async () => {
                if (!starshipIdStr) return
                const email = inviteEmail.trim()
                if (!email) return
                const res = await createInvite.mutateAsync({ email })
                setLastInviteUrl(res.inviteUrl || null)
                queryClient.invalidateQueries({ queryKey: STARSHIP_MEMBERS_QUERY_KEYS.byStarship(starshipIdStr) })
              }}
            >
              {createInvite.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={open => {
          if (!open) setConfirmAction(null)
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">{confirmAction?.kind === 'kickHuman' ? 'Kick member' : confirmAction?.kind === 'revokeInvite' ? 'Revoke invitation' : 'Confirm'}</DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === 'kickHuman'
                ? "This will remove this member's access to the starship immediately."
                : confirmAction?.kind === 'revokeInvite'
                  ? 'This will revoke the invite so it can no longer be used.'
                  : ''}
            </DialogDescription>
          </DialogHeader>

          {confirmAction ? (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-sm">
              <div className="flex items-start gap-2">
                <Icon name="alert-triangle" className="h-4 w-4 text-destructive mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium text-destructive">You&apos;re about to:</p>
                  <p className="text-destructive/80 break-words">
                    {confirmAction.kind === 'kickHuman' ? `Kick ${confirmAction.label}` : confirmAction.kind === 'revokeInvite' ? `Revoke invitation for ${confirmAction.label}` : ''}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmAction(null)} disabled={removeMember.isPending || revokeInvite.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeMember.isPending || revokeInvite.isPending}
              onClick={async () => {
                const action = confirmAction
                if (!action) return
                try {
                  if (action.kind === 'kickHuman') {
                    await removeMember.mutateAsync(action.userId)
                  } else if (action.kind === 'revokeInvite') {
                    await revokeInvite.mutateAsync(action.email)
                  }
                } finally {
                  setConfirmAction(null)
                }
              }}
            >
              {confirmAction?.kind === 'kickHuman'
                ? removeMember.isPending
                  ? 'Kicking…'
                  : 'Kick'
                : confirmAction?.kind === 'revokeInvite'
                  ? revokeInvite.isPending
                    ? 'Revoking…'
                    : 'Revoke'
                  : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
