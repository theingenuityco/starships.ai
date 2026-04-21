'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Orbitron } from 'next/font/google'

import Icon from '@/components/primitives/Icon'
import StarryBackground from '@/app/components/StarryBackground'
import {
  footerEyebrowDark,
  footerNavLinkDark,
  footerTopDividerLandingDark,
  footerTopDividerTheme,
  footerVioletArc,
  socialDark,
} from '@/app/components/landing/landingSurface'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { track } from '@/lib/analytics'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

export function PublicFooter(props: {
  fromPath?: string
  showTopDivider?: boolean
  topDividerVariant?: 'theme' | 'landingDark'
  continuesLandingBackground?: boolean
}) {
  const fromPath = props.fromPath ?? '/'
  const showTopDivider = props.showTopDivider ?? true
  const topDividerVariant = props.topDividerVariant ?? 'theme'
  const continuesLandingBackground = props.continuesLandingBackground ?? false

  const topDividerClassName = topDividerVariant === 'landingDark' ? footerTopDividerLandingDark : footerTopDividerTheme

  const starLayerClassName = continuesLandingBackground ? 'z-[1] opacity-45' : 'z-[1] opacity-[0.55]'
  const starColor = continuesLandingBackground ? 'rgba(255,255,255,0.78)' : 'rgba(255, 255, 255, 0.92)'

  const footerGroups: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
    {
      title: 'Platform',
      links: [
        { label: 'Pricing', href: '/pricing' },
        { label: 'Explore', href: '/explore' },
        { label: 'Login', href: '/login' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Documentation', href: '/docs', external: true },
        { label: 'Marketplace', href: '/marketplace' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'Contact', href: 'mailto:tech@theingenuity.co', external: true },
        { label: 'Discord', href: 'https://discord.gg/wzF7xfjrKv', external: true },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy policy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
      ],
    },
  ]

  return (
    <footer className="relative isolate overflow-hidden border-t border-white/10 bg-[#0f0f0f] pt-10 pb-8 text-white sm:pt-14">
      {showTopDivider ? <div suppressHydrationWarning className={topDividerClassName} /> : null}

      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={{
          backgroundImage: footerVioletArc,
        }}
      />

      <StarryBackground
        position="absolute"
        className={starLayerClassName}
        style={
          {
            '--star-color': starColor,
          } as CSSProperties
        }
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-8">
        <div className="grid grid-cols-1 gap-10 pb-10 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white outline-none ring-offset-2 ring-offset-[#0f0f0f] focus-visible:ring-2 focus-visible:ring-white/40"
              onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: '/' })}
            >
              <span
                className="flex items-center gap-2"
                style={
                  {
                    '--foreground': '226 232 240',
                    '--background': '15 23 42',
                  } as CSSProperties
                }
              >
                <StarshipsLogo width={30} height={30} className="text-white" gradientId="footer-starships-logo-gradient" idleLoop activeStroke="gradient" />
                <span className={`${orbitron.className} text-lg sm:text-xl font-normal tracking-tight leading-none`}>starships.ai</span>
              </span>
            </Link>
            <p className="mt-4 max-w-lg text-sm font-medium leading-relaxed text-white/80">
              Team chat, powered by AI agents. Collaborate with your team, delegate work to agents, and ship faster.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <a
                href="mailto:tech@theingenuity.co"
                aria-label="Email"
                className={socialDark}
                onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'mailto:tech@theingenuity.co' })}
              >
                <Icon name="mail" className="h-5 w-5" />
              </a>
              <a
                href="https://discord.gg/wzF7xfjrKv"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className={socialDark}
                onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://discord.gg/wzF7xfjrKv' })}
              >
                <Icon name="discord" className="h-5 w-5" />
              </a>
              <a
                href="https://www.youtube.com/@StarshipsAI"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className={socialDark}
                onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://www.youtube.com/@StarshipsAI' })}
              >
                <Icon name="youtube" className="h-5 w-5" />
              </a>
              <a
                href="https://www.instagram.com/starships.ai/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className={socialDark}
                onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://www.instagram.com/starships.ai/' })}
              >
                <Icon name="instagram" className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div className="md:col-span-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {footerGroups.map(group => (
              <div key={group.title}>
                <div className={footerEyebrowDark}>{group.title}</div>
                <ul className="mt-4 space-y-0.5">
                  {group.links.map(link => (
                    <li key={`${group.title}-${link.label}`}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                          rel={link.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                          className={footerNavLinkDark}
                          onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: link.href })}
                        >
                          {link.label}
                          {!link.href.startsWith('mailto:') ? <Icon name="external-link" className="h-3.5 w-3.5 shrink-0 opacity-80" /> : null}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className={footerNavLinkDark}
                          onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: link.href })}
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-8 text-[11px] font-semibold tracking-[0.1em] text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Starships.ai. All rights reserved.</p>
          <p className="normal-case tracking-normal text-white/70">
            Built by{' '}
            <a
              href="https://theingenuity.co"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-1 py-0.5 font-semibold text-white transition-colors duration-100 hover:bg-white/10"
              onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://theingenuity.co' })}
            >
              The Ingenuity Co
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
