'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { formatDate } from '@/lib/utils'

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/70">{label}:</span> <span className="break-words">{value}</span>
    </div>
  )
}

function safeFormatDate(value?: string): string | null {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const t = Date.parse(trimmed)
  if (!Number.isFinite(t)) return null
  return formatDate(new Date(t).toISOString())
}

export function UserProfileHoverCardContent({
  title,
  subtitle,
  isAuthedUser,
  explicitAvatarUrl,
  resolvedAvatarUrl,
  avatarSeed,
  fallbackInitials,
  fallbackVariant,
  userIdShort,
  email,
  roleLabel,
  memberSince,
  statusLabel,
}: {
  title: string
  subtitle?: string
  isAuthedUser: boolean
  explicitAvatarUrl?: string
  resolvedAvatarUrl?: string
  avatarSeed?: string
  fallbackInitials: string
  fallbackVariant: 'initials' | 'user-icon'
  userIdShort?: string
  email?: string
  roleLabel?: string
  memberSince?: string
  statusLabel: string
}) {
  const normalizedSubtitle = (subtitle || '').trim()
  const normalizedEmail = (email || '').trim()
  const showEmailRow = Boolean(normalizedEmail && normalizedEmail.toLowerCase() !== normalizedSubtitle.toLowerCase())
  const memberSinceLabel = safeFormatDate(memberSince)

  return (
    <div className="flex items-start gap-3">
      <div className="relative h-9 w-9">
        <Avatar className="h-9 w-9 rounded-full ring-1 ring-border/40 bg-primary/10 overflow-hidden">
          {explicitAvatarUrl ? (
            <AvatarImage src={explicitAvatarUrl} alt={title || 'User avatar'} referrerPolicy="no-referrer" className="rounded-full object-cover" />
          ) : avatarSeed ? (
            <AgentAvatar seed={avatarSeed} size={36} rounded />
          ) : resolvedAvatarUrl ? (
            <AvatarImage src={resolvedAvatarUrl} alt={title || 'User avatar'} referrerPolicy="no-referrer" className="rounded-full object-cover" />
          ) : null}
          <AvatarFallback className="rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
            {fallbackVariant === 'user-icon' ? (
              <Icon name="user" iconOverride={{ type: 'phosphor', component: 'User' }} weight="bold" size={16} className="text-primary" />
            ) : (
              fallbackInitials
            )}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-foreground truncate">{title}</div>
          {isAuthedUser ? <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">You</span> : null}
        </div>
        {subtitle ? <div className="text-xs text-muted-foreground truncate">{subtitle}</div> : null}
        <div className="mt-2 flex flex-col gap-1">
          {userIdShort ? <DetailRow label="User ID" value={userIdShort} /> : null}
          {showEmailRow ? <DetailRow label="Email" value={email!} /> : null}
          {roleLabel ? <DetailRow label="Role" value={roleLabel} /> : null}
          {memberSinceLabel ? <DetailRow label="Member since" value={memberSinceLabel} /> : null}
          <DetailRow label="Status" value={statusLabel} />
        </div>
      </div>
    </div>
  )
}

export function AgentProfileHoverCardContent({
  name,
  avatarUrl,
  modelId,
  statusLabel,
  roleLabel,
  category,
  version,
  toolsCount,
  lastTurnSummary,
  createdAt,
  updatedAt,
}: {
  name: string
  avatarUrl?: string
  modelId?: string
  statusLabel: string
  roleLabel?: string
  category?: string
  version?: string
  toolsCount?: number
  lastTurnSummary?: string
  createdAt?: string
  updatedAt?: string
}) {
  const metaParts = [modelId ? `Model: ${modelId}` : ''].filter(Boolean)

  return (
    <div className="flex items-start gap-3">
      <div className="relative h-9 w-9">
        <div className="h-9 w-9 rounded-full ring-1 ring-border/40 bg-muted/30 overflow-hidden">
          <AgentAvatar seed={name || 'AI'} imageUrl={avatarUrl} size={36} rounded />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground truncate">{name || 'Assistant'}</div>
        {metaParts.length > 0 ? <div className="text-xs text-muted-foreground truncate">{metaParts.join(' • ')}</div> : null}
        <div className="mt-2 flex flex-col gap-1">
          <DetailRow label="Status" value={statusLabel} />
          {roleLabel ? <DetailRow label="Role" value={roleLabel} /> : null}
          {category ? <DetailRow label="Category" value={category} /> : null}
          {version ? <DetailRow label="Version" value={version} /> : null}
          {typeof toolsCount === 'number' && toolsCount > 0 ? <DetailRow label="Tools" value={String(toolsCount)} /> : null}
          {lastTurnSummary ? <DetailRow label="Last turn" value={lastTurnSummary} /> : null}
          {safeFormatDate(createdAt) ? <DetailRow label="Created" value={safeFormatDate(createdAt)!} /> : null}
          {safeFormatDate(updatedAt) ? <DetailRow label="Updated" value={safeFormatDate(updatedAt)!} /> : null}
        </div>
      </div>
    </div>
  )
}
