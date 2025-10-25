'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Icon from '@/components/primitives/Icon'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Orbitron } from 'next/font/google'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

export function PublicHeader(): React.JSX.Element {
  const pathname = usePathname()
  const router = useRouter()
  const [logoTrigger, setLogoTrigger] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [brandCollapsed, setBrandCollapsed] = useState(false)

  // Collapse brand text after scrolling past threshold
  useEffect(() => {
    const COLLAPSE_SCROLL_Y = 48
    const onScroll = () => {
      const shouldCollapse = window.scrollY > COLLAPSE_SCROLL_Y
      setBrandCollapsed(shouldCollapse)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="fixed top-4 sm:top-8 left-0 right-0 z-50">
      <div className="px-4 sm:px-8 flex items-center justify-between h-8">
        <button
          className="cursor-pointer select-none h-8 flex items-center"
          onClick={() => {
            setLogoTrigger(v => v + 1)
            router.push('/')
          }}
          title="Go to home"
        >
          <span className="flex items-center gap-2">
            <StarshipsLogo width={32} height={32} className="text-foreground" idleLoop={false} playOnMountOnce={false} triggerAnimation={logoTrigger} />
            <span
              className={`${orbitron.className} text-lg sm:text-xl md:text-2xl font-normal tracking-tight leading-none transition-all duration-200 ease-out ${
                brandCollapsed ? 'opacity-0 -translate-x-1 max-w-0 w-0 overflow-hidden' : 'opacity-100 translate-x-0 max-w-[260px] w-auto'
              }`}
            >
              starships.ai
            </span>
          </span>
        </button>

        <nav className="hidden sm:flex items-center gap-3 md:gap-6 text-sm leading-none">
          <Link
            href="/"
            className={`hidden md:inline ${pathname === '/' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}`}
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            Home
          </Link>
          <Link
            href="/marketplace"
            className={`${pathname.startsWith('/marketplace') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}`}
            aria-current={pathname.startsWith('/marketplace') ? 'page' : undefined}
          >
            Marketplace
          </Link>
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className={`${pathname.startsWith('/docs') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}`}
            aria-current={pathname.startsWith('/docs') ? 'page' : undefined}
          >
            <span className="inline-flex items-center gap-1">
              <span className="hidden md:inline">Documentation</span>
              <span className="inline md:hidden">Docs</span>
              <Icon name="external-link" className="w-3 h-3 opacity-80" />
            </span>
          </a>
        </nav>

        {/* Mobile menu toggle */}
        <div className="sm:hidden relative">
          <button
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(v => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card/60 backdrop-blur hover:bg-accent text-foreground"
          >
            <Icon name={mobileMenuOpen ? 'x' : 'menu'} className="w-4 h-4" />
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-lg p-1 z-[60]">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm ${pathname === '/' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
              >
                Home
              </Link>
              <Link
                href="/marketplace"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm ${pathname.startsWith('/marketplace') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
              >
                Marketplace
              </Link>
              <a
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                Docs
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default PublicHeader
