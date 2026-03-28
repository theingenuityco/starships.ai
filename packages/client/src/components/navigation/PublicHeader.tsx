'use client'

import { landingHeaderNavItem, landingPrimaryCtaHeader } from '@/app/components/landing/landingSurface'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/primitives/Icon'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { track } from '@/lib/analytics'
import { Orbitron } from 'next/font/google'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

export function PublicHeader(): React.JSX.Element {
  const pathname = usePathname()
  const router = useRouter()
  const [logoTrigger, setLogoTrigger] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [brandCollapsed, setBrandCollapsed] = useState(false)
  const headerRef = useRef<HTMLElement | null>(null)
  const pendingLogoActionRef = useRef<null | (() => void)>(null)
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runPendingLogoAction = useCallback(() => {
    const fn = pendingLogoActionRef.current
    pendingLogoActionRef.current = null
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current)
      fallbackTimeoutRef.current = null
    }
    fn?.()
  }, [])

  // Collapse brand text after scrolling past threshold
  useEffect(() => {
    const COLLAPSE_SCROLL_Y = 48
    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      let el: HTMLElement | null = node
      while (el && el.parentElement) {
        const parent = el.parentElement as HTMLElement
        if (parent === document.body) return null
        const style = window.getComputedStyle(parent)
        const overflowY = style.overflowY
        const isScrollable = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
        if (isScrollable && parent.scrollHeight > parent.clientHeight) return parent
        el = parent
      }
      return null
    }

    const scrollParent = getScrollParent(headerRef.current)
    const onScroll = () => {
      const y = scrollParent ? scrollParent.scrollTop : window.scrollY
      const shouldCollapse = y > COLLAPSE_SCROLL_Y
      setBrandCollapsed(shouldCollapse)
    }
    onScroll()
    if (scrollParent) {
      scrollParent.addEventListener('scroll', onScroll, { passive: true })
      return () => scrollParent.removeEventListener('scroll', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    return () => {
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
    }
  }, [])

  return (
    <header ref={headerRef} className="sticky top-0 z-50 w-full bg-transparent">
      <div className="px-4 sm:px-8 flex items-center justify-between py-6 sm:py-7">
        <button
          className="cursor-pointer select-none h-8 flex items-center"
          onClick={() => {
            setLogoTrigger(v => v + 1)
            track({ type: 'public_header_logo_clicked', fromPath: pathname ?? '' })
            // On non-home routes, wait for the logo entry animation so the effect is visible
            // (otherwise navigation happens immediately and the animation never paints).
            if (pathname === '/') return
            pendingLogoActionRef.current = () => router.push('/')
            // Fallback for reduced motion / missed animation completion callbacks.
            fallbackTimeoutRef.current = setTimeout(() => {
              runPendingLogoAction()
            }, 1100)
          }}
          title="Go to home"
        >
          <span className="flex items-center gap-2">
            <StarshipsLogo width={36} height={36} className="text-foreground" idleLoop={false} playOnMountOnce={false} triggerAnimation={logoTrigger} onEntryAnimationComplete={runPendingLogoAction} />
            <span
              className={`${orbitron.className} text-lg sm:text-xl md:text-2xl font-normal tracking-tight leading-none transition-all duration-200 ease-out ${
                brandCollapsed ? 'opacity-0 -translate-x-1 max-w-0 w-0 overflow-hidden' : 'opacity-100 translate-x-0 max-w-[260px] w-auto'
              }`}
            >
              starships.ai
            </span>
          </span>
        </button>

        <nav className="hidden sm:flex items-center gap-4 md:gap-7 text-[15px] md:text-base leading-none">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={[
                  'inline-flex items-center gap-1.5 rounded-none transition-colors duration-100',
                  pathname.startsWith('/use-cases') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
                  landingHeaderNavItem,
                ].join(' ')}
                aria-current={pathname.startsWith('/use-cases') ? 'page' : undefined}
              >
                <span>Use cases</span>
                <Icon name="chevron-down" className="h-4 w-4 opacity-80" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Use cases</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/use-cases/lead-generation', variant: 'desktop' })
                  router.push('/use-cases/lead-generation')
                }}
              >
                <Icon name="sparkles" />
                <div className="min-w-0">
                  <div className="font-medium text-sm text-foreground">Lead generation</div>
                  <div className="text-xs text-muted-foreground truncate">Research → personalize → follow up → improve</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/use-cases/wordpress-site', variant: 'desktop' })
                  router.push('/use-cases/wordpress-site')
                }}
              >
                <Icon name="globe" />
                <div className="min-w-0">
                  <div className="font-medium text-sm text-foreground">WordPress site</div>
                  <div className="text-xs text-muted-foreground truncate">Plan → write → SEO → launch checklist</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link
            href="/explore"
            onClick={() => track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/explore', variant: 'desktop' })}
            className={`${landingHeaderNavItem} ${pathname.startsWith('/explore') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            aria-current={pathname.startsWith('/explore') ? 'page' : undefined}
          >
            Explore
          </Link>
          <Link
            href="/pricing"
            onClick={() => track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/pricing', variant: 'desktop' })}
            className={`${landingHeaderNavItem} ${pathname.startsWith('/pricing') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            aria-current={pathname.startsWith('/pricing') ? 'page' : undefined}
          >
            Pricing
          </Link>
          <Link
            href="/login"
            onClick={() => track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/login', variant: 'desktop' })}
            className={`${landingHeaderNavItem} ${pathname.startsWith('/login') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            aria-current={pathname.startsWith('/login') ? 'page' : undefined}
          >
            Login
          </Link>
          {pathname !== '/' ? (
            <Link
              href="/login"
              onClick={() => track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/login', variant: 'desktop' })}
              className={landingPrimaryCtaHeader}
            >
              Get Started Free
            </Link>
          ) : null}
        </nav>

        {/* Mobile menu toggle */}
        <div className="sm:hidden relative">
          <Icon
            name={mobileMenuOpen ? 'x' : 'menu'}
            role="button"
            tabIndex={0}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            title={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => {
              setMobileMenuOpen(v => {
                const next = !v
                track({ type: 'public_header_mobile_menu_toggled', fromPath: pathname ?? '', isOpen: next })
                return next
              })
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setMobileMenuOpen(v => {
                  const next = !v
                  track({ type: 'public_header_mobile_menu_toggled', fromPath: pathname ?? '', isOpen: next })
                  return next
                })
              }
            }}
            className="h-5 w-5 text-muted-foreground cursor-pointer select-none transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />

          {mobileMenuOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-lg p-1 z-[60]">
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Use cases</div>
              <Link
                href="/use-cases/lead-generation"
                onClick={() => {
                  track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/use-cases/lead-generation', variant: 'mobile' })
                  setMobileMenuOpen(false)
                }}
                className={`block rounded-none px-3 py-2 text-sm transition-colors duration-100 ${pathname === '/use-cases/lead-generation' ? 'text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                Lead generation
              </Link>
              <Link
                href="/use-cases/wordpress-site"
                onClick={() => {
                  track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/use-cases/wordpress-site', variant: 'mobile' })
                  setMobileMenuOpen(false)
                }}
                className={`block rounded-none px-3 py-2 text-sm transition-colors duration-100 ${pathname === '/use-cases/wordpress-site' ? 'text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                WordPress site
              </Link>
              <Link
                href="/explore"
                onClick={() => {
                  track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/explore', variant: 'mobile' })
                  setMobileMenuOpen(false)
                }}
                className={`block rounded-none px-3 py-2 text-sm transition-colors duration-100 ${pathname.startsWith('/explore') ? 'text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                Explore
              </Link>
              <Link
                href="/login"
                onClick={() => {
                  track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/login', variant: 'mobile' })
                  setMobileMenuOpen(false)
                }}
                className={`block rounded-none px-3 py-2 text-sm transition-colors duration-100 ${pathname.startsWith('/login') ? 'text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                Login
              </Link>
              <Link
                href="/pricing"
                onClick={() => {
                  track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/pricing', variant: 'mobile' })
                  setMobileMenuOpen(false)
                }}
                className={`block rounded-none px-3 py-2 text-sm transition-colors duration-100 ${pathname.startsWith('/pricing') ? 'text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                Pricing
              </Link>
              {pathname !== '/' ? (
                <Link
                  href="/login"
                  onClick={() => {
                    track({ type: 'public_header_nav_clicked', fromPath: pathname ?? '', destination: '/login', variant: 'mobile' })
                    setMobileMenuOpen(false)
                  }}
                  className={`block w-full text-center ${landingPrimaryCtaHeader} px-3 py-2.5`}
                >
                  Get Started Free
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default PublicHeader
