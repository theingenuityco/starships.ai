'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Orbitron } from 'next/font/google'

import Icon from '@/components/primitives/Icon'
import StarryBackground from '@/app/components/StarryBackground'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { track } from '@/lib/analytics'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

/*
 * Neo-brutalism tuned to Starships.ai (no box borders):
 * — Navy + stars + violet arc; hard offset shadows for depth, not outlines.
 * — Amber reserved for hover “thrust” on interactive hits.
 */
const panel =
  'rounded-none bg-[#060b22]/90 shadow-[4px_4px_0_0_rgb(99_102_241)]'
const panelLift =
  'transition-all duration-100 ease-out hover:-translate-y-px hover:shadow-[5px_5px_0_0_rgb(167_139_250)]'

const socialBtn =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-none bg-white/[0.07] text-white shadow-[3px_3px_0_0_rgb(139_92_246)] transition-all duration-100 ease-out hover:-translate-y-px hover:bg-white/[0.12] hover:shadow-[4px_4px_0_0_rgb(250_204_21)] hover:text-white active:translate-x-0.5 active:translate-y-0 active:shadow-[2px_2px_0_0_rgb(99_102_241)]'

const navLinkClass =
  'inline-flex w-full max-w-full items-center gap-1.5 rounded-none py-1.5 text-sm font-semibold text-white/90 transition-colors duration-100 hover:bg-white/[0.06] hover:text-white'

export function PublicFooter(props: {
  fromPath?: string
  showTopDivider?: boolean
  topDividerVariant?: 'theme' | 'landingDark'
  /** Softer stars when the page already renders a fixed starfield (e.g. home). */
  continuesLandingBackground?: boolean
}) {
  const fromPath = props.fromPath ?? '/'
  const showTopDivider = props.showTopDivider ?? true
  const topDividerVariant = props.topDividerVariant ?? 'theme'
  const continuesLandingBackground = props.continuesLandingBackground ?? false

  const topDividerClassName =
    topDividerVariant === 'landingDark'
      ? 'absolute top-0 left-0 right-0 z-[15] h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent'
      : 'absolute top-0 left-0 right-0 z-[15] h-px bg-gradient-to-r from-transparent via-border/80 to-transparent'

  const starLayerClassName = continuesLandingBackground ? 'z-[1] opacity-45' : 'z-[1] opacity-[0.55]'
  const starColor = continuesLandingBackground ? 'rgba(255,255,255,0.78)' : 'rgba(255, 255, 255, 0.92)'

  const footerGroups: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
    {
      title: 'Platform',
      links: [
        { label: 'Pricing', href: '/pricing' },
        { label: 'Explore', href: '/explore' },
        { label: 'Use cases', href: '/use-cases' },
        { label: 'Login', href: '/login' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Documentation', href: '/docs', external: true },
        { label: 'Lead generation', href: '/use-cases/lead-generation' },
        { label: 'WordPress site', href: '/use-cases/wordpress-site' },
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
    <footer className="relative isolate overflow-hidden border-t border-white/10 bg-[#050b24] pt-10 pb-8 text-white sm:pt-14">
      {showTopDivider ? <div suppressHydrationWarning className={topDividerClassName} /> : null}

      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={{
          backgroundImage: 'radial-gradient(ellipse 1200px 650px at 50% 120%, rgba(168,85,247,0.18), transparent 72%)',
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
            <div className={`${panel} ${panelLift} p-4 sm:p-5`}>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-white outline-none ring-offset-2 ring-offset-[#050b24] focus-visible:ring-2 focus-visible:ring-violet-400"
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
                  className={socialBtn}
                  onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'mailto:tech@theingenuity.co' })}
                >
                  <Icon name="mail" className="h-5 w-5" />
                </a>
                <a
                  href="https://github.com/theingenuityai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                  className={socialBtn}
                  onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://github.com/theingenuityai' })}
                >
                  <Icon name="github" className="h-5 w-5" />
                </a>
                <a
                  href="https://discord.gg/wzF7xfjrKv"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Discord"
                  className={socialBtn}
                  onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://discord.gg/wzF7xfjrKv' })}
                >
                  <Icon name="discord" className="h-5 w-5" />
                </a>
                <a
                  href="https://www.youtube.com/@StarshipsAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className={socialBtn}
                  onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://www.youtube.com/@StarshipsAI' })}
                >
                  <Icon name="youtube" className="h-5 w-5" />
                </a>
                <a
                  href="https://www.instagram.com/starships.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className={socialBtn}
                  onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://www.instagram.com/starships.ai/' })}
                >
                  <Icon name="instagram" className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>

          <div className="md:col-span-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {footerGroups.map(group => (
              <div key={group.title} className={`${panel} ${panelLift} p-4`}>
                <div className="pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-200">{group.title}</div>
                <ul className="mt-4 space-y-0.5">
                  {group.links.map(link => (
                    <li key={`${group.title}-${link.label}`}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                          rel={link.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                          className={navLinkClass}
                          onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: link.href })}
                        >
                          {link.label}
                          {!link.href.startsWith('mailto:') ? <Icon name="external-link" className="h-3.5 w-3.5 shrink-0 opacity-80" /> : null}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className={navLinkClass}
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

        <div className="flex flex-col gap-3 pt-8 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Starships.ai. All rights reserved.</p>
          <p className="normal-case tracking-normal text-white/70">
            Built by{' '}
            <a
              href="https://theingenuity.co"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-none px-1 py-0.5 font-semibold text-white transition-colors duration-100 hover:bg-white/10"
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
