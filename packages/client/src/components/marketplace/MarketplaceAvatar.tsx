'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export type MarketplaceAvatarProps = {
  imageUrl?: string | null
  label?: string | null
  /**
   * Used to generate initials when `imageUrl` is missing.
   * For agents, this can be the agent name/slug.
   */
  seed?: string | null
  /** Controls the outer box size (Tailwind classes). */
  sizeClassName?: string
  /** Controls the outer box shape (Tailwind classes). */
  shapeClassName?: string
  /** Outer ring/border treatment. */
  ringClassName?: string
  /** Outer background treatment. */
  bgClassName?: string
  /** Shadow treatment. */
  shadowClassName?: string
  /** When true, show the subtle inset ring overlay (marketplace style). */
  showInsetRing?: boolean
  /** When true, show a subtle purple tint when missing an image. */
  showTintWhenMissing?: boolean
  /** Customize the tint background (Tailwind arbitrary value or classes). */
  tintClassName?: string
  /** Customize fallback initials styling. */
  fallbackTextClassName?: string
  className?: string
}

function initialsFromSeed(seed: string): string {
  const parts = seed.trim().split(/\s+/).filter(Boolean)
  const letters = parts
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .filter(Boolean)
    .join('')
  return letters || seed.trim().slice(0, 2).toUpperCase()
}

export function MarketplaceAvatar({
  imageUrl,
  label,
  seed,
  sizeClassName = 'h-20 w-20 sm:h-24 sm:w-24',
  shapeClassName = 'rounded-2xl',
  ringClassName = 'ring-1 ring-border/50',
  bgClassName = 'bg-muted/40',
  shadowClassName = 'shadow-lg',
  showInsetRing = true,
  showTintWhenMissing = true,
  tintClassName = 'bg-[radial-gradient(circle_at_30%_30%,rgba(124,58,237,0.22),transparent_60%)]',
  fallbackTextClassName = 'text-2xl sm:text-3xl font-semibold text-muted-foreground',
  className,
}: MarketplaceAvatarProps) {
  const img = typeof imageUrl === 'string' ? imageUrl.trim() : ''
  const [didError, setDidError] = useState(false)
  useEffect(() => {
    setDidError(false)
  }, [img])
  const hasImage = img.length > 0 && !didError

  const rawSeed = typeof seed === 'string' ? seed.trim() : ''
  const rawLabel = typeof label === 'string' ? label.trim() : ''
  const fallbackSeed = rawSeed || rawLabel || 'AI'
  const initials = initialsFromSeed(fallbackSeed)

  return (
    <div className={cn('relative overflow-hidden flex-shrink-0', sizeClassName, shapeClassName, ringClassName, bgClassName, shadowClassName, className)}>
      {!hasImage && showTintWhenMissing ? <div className={cn('absolute inset-0', shapeClassName, tintClassName)} /> : null}
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={rawLabel || 'Avatar'} referrerPolicy="no-referrer" decoding="async" onError={() => setDidError(true)} className="relative z-10 h-full w-full object-cover" />
      ) : (
        <div className="relative z-10 h-full w-full flex items-center justify-center">
          <span className={fallbackTextClassName}>{initials || 'AI'}</span>
        </div>
      )}
      {/* Avoid an inner border on "empty" (missing-image) avatars. */}
      {showInsetRing && hasImage ? <div className={cn('pointer-events-none absolute inset-0', shapeClassName, 'ring-1 ring-inset ring-white/10')} /> : null}
    </div>
  )
}
