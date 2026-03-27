'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Orbitron } from 'next/font/google'

import Icon from '@/components/primitives/Icon'
import StarryBackground from '@/app/components/StarryBackground'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { track } from '@/lib/analytics'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

export function PublicFooter(props: { fromPath?: string; showTopDivider?: boolean; topDividerVariant?: 'theme' | 'landingDark' }) {
  const fromPath = props.fromPath ?? '/'
  const showTopDivider = props.showTopDivider ?? true
  const topDividerVariant = props.topDividerVariant ?? 'theme'

  const topDividerClassName =
    topDividerVariant === 'landingDark'
      ? 'absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent'
      : 'absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent'

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
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#050b24] pt-16 pb-8 text-white sm:pt-20">
      {/* Gradient horizontal line */}
      {showTopDivider ? <div suppressHydrationWarning className={topDividerClassName} /> : null}
      <StarryBackground
        position="absolute"
        className="z-0 opacity-60"
        style={
          {
            '--star-color': 'rgba(255,255,255,0.65)',
          } as CSSProperties
        }
      />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={{
          backgroundImage: [
            'radial-gradient(ellipse 900px 500px at 10% 0%, rgba(59,130,246,0.16), transparent 65%)',
            'radial-gradient(ellipse 900px 500px at 90% 0%, rgba(139,92,246,0.18), transparent 65%)',
            'radial-gradient(ellipse 1200px 650px at 50% 120%, rgba(168,85,247,0.2), transparent 72%)',
          ].join(', '),
        }}
      />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-8">
        <div className="relative z-10 grid grid-cols-1 gap-12 border-b border-white/15 pb-10 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white"
              onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: '/' })}
            >
              <span
                className="flex items-center gap-2"
                style={
                  {
                    // Make the logo gradient bright and legible on dark footer + light pages.
                    '--foreground': '226 232 240',
                    '--background': '15 23 42',
                  } as CSSProperties
                }
              >
                <StarshipsLogo width={30} height={30} className="text-white" gradientId="footer-starships-logo-gradient" idleLoop activeStroke="gradient" />
                <span className={`${orbitron.className} text-lg sm:text-xl font-normal tracking-tight leading-none`}>starships.ai</span>
              </span>
            </Link>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/70">
              Team chat, powered by AI agents. Collaborate with your team, delegate work to agents, and ship faster.
            </p>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/65">
              Deploy agents, add tools, and run repeatable workflows in one workspace with clear approvals and accountable execution.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/75">Deploy agents + tools</span>
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/75">Schedule repetitive tasks</span>
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/75">Isolation + encryption</span>
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/75">Live observability</span>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <a
                href="mailto:tech@theingenuity.co"
                aria-label="Email"
                className="text-white/70 transition-colors hover:text-white"
                onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'mailto:tech@theingenuity.co' })}
              >
                <Icon name="mail" className="h-4 w-4" />
              </a>
              <a
                href="https://github.com/theingenuityai"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="text-white/70 transition-colors hover:text-white"
                onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://github.com/theingenuityai' })}
              >
                <Icon name="github" className="h-4 w-4" />
              </a>
              <a
                href="https://discord.gg/wzF7xfjrKv"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="text-white/70 transition-colors hover:text-white"
                onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://discord.gg/wzF7xfjrKv' })}
              >
                <Icon name="discord" className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="md:col-span-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {footerGroups.map(group => (
              <div key={group.title}>
                <div className="text-[11px] uppercase tracking-[0.08em] text-white/60">{group.title}</div>
                <ul className="mt-4 space-y-2.5">
                  {group.links.map(link => (
                    <li key={`${group.title}-${link.label}`}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                          rel={link.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                          className="inline-flex items-center gap-1.5 text-sm text-white/85 transition-colors hover:text-white"
                          onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: link.href })}
                        >
                          {link.label}
                          {!link.href.startsWith('mailto:') ? <Icon name="external-link" className="h-3.5 w-3.5" /> : null}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="inline-flex items-center gap-1.5 text-sm text-white/85 transition-colors hover:text-white"
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

        <div className="relative z-10 flex flex-col gap-3 pt-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Starships.ai. All rights reserved.</p>
          <p>
            Built by{' '}
            <a
              href="https://theingenuity.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/85 hover:text-white underline underline-offset-4 transition-colors"
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
