import React, { createContext, useContext, useMemo } from 'react'
import type { PlatformContextValue, PlatformImageProps, PlatformLinkProps, PlatformRouter } from './types'

function defaultRouter(): PlatformRouter {
  return {
    push: href => {
      if (typeof window === 'undefined') return
      window.location.assign(href)
    },
    replace: href => {
      if (typeof window === 'undefined') return
      window.location.replace(href)
    },
    back: () => {
      if (typeof window === 'undefined') return
      window.history.back()
    },
  }
}

const DefaultLink: React.FC<PlatformLinkProps> = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
)

const DefaultImage: React.FC<PlatformImageProps> = ({ alt, ...rest }) => <img alt={alt} {...rest} />

const DEFAULT_PLATFORM_VALUE: PlatformContextValue = {
  Link: DefaultLink,
  Image: DefaultImage,
  router: defaultRouter(),
  params: null,
  pathname: typeof window !== 'undefined' ? window.location.pathname : null,
  searchParams: typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null,
  brandFontClassName: null,
  headingFontClassName: null,
}

const PlatformContext = createContext<PlatformContextValue>(DEFAULT_PLATFORM_VALUE)

export function PlatformProvider({
  value,
  children,
}: {
  value: Partial<PlatformContextValue>
  children: React.ReactNode
}) {
  const parent = useContext(PlatformContext)
  const merged = useMemo<PlatformContextValue>(() => {
    const base = parent ?? DEFAULT_PLATFORM_VALUE
    return {
      Link: value.Link ?? base.Link,
      Image: value.Image ?? base.Image,
      router: value.router ?? base.router ?? defaultRouter(),
      params: value.params ?? base.params ?? null,
      pathname: value.pathname ?? base.pathname ?? null,
      searchParams: value.searchParams ?? base.searchParams ?? null,
      brandFontClassName: value.brandFontClassName ?? base.brandFontClassName ?? null,
      headingFontClassName: value.headingFontClassName ?? base.headingFontClassName ?? null,
    }
  }, [parent, value])

  return <PlatformContext.Provider value={merged}>{children}</PlatformContext.Provider>
}

export function usePlatform() {
  return useContext(PlatformContext)
}

