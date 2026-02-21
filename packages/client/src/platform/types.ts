import type React from 'react'

export type PlatformLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  /** Compatibility with Next.js Link callers (ignored by default impl). */
  prefetch?: boolean
  replace?: boolean
  scroll?: boolean
  shallow?: boolean
  locale?: string | false
}

export type PlatformLinkComponent = React.ComponentType<PlatformLinkProps>

export type PlatformImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string
  alt: string
  width?: number
  height?: number
  /** Compatibility with Next.js Image callers (ignored by default impl). */
  fill?: boolean
  sizes?: string
  priority?: boolean
}

export type PlatformImageComponent = React.ComponentType<PlatformImageProps>

export type PlatformRouter = {
  push: (href: string, options?: { scroll?: boolean }) => void
  replace: (href: string, options?: { scroll?: boolean }) => void
  back: () => void
  refresh: () => void
  prefetch?: (href: string) => void
}

export type PlatformContextValue = {
  Link: PlatformLinkComponent
  Image: PlatformImageComponent
  router?: PlatformRouter
  params?: Record<string, string | string[]> | null
  pathname?: string
  searchParams?: URLSearchParams | null
  brandFontClassName?: string | null
  headingFontClassName?: string | null
}

