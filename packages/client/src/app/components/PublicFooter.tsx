'use client'

import Link from 'next/link'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'

export function PublicFooter(props: { fromPath?: string }) {
  const fromPath = props.fromPath ?? '/'

  return (
    <footer className="py-16 px-4 relative">
      {/* Gradient horizontal line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="w-full relative">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="mb-6 md:mb-0 text-center md:text-left">
            <p className="text-muted-foreground mb-2">© 2026 Starships.ai - Where Ideas meet Intelligence</p>
            <p className="text-muted-foreground text-sm">
              🪐 Manifested by{' '}
              <a
                href="https://theingenuity.co"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors underline"
                onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: 'https://theingenuity.co' })}
              >
                The Ingenuity Co
              </a>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                track({ type: 'public_footer_link_clicked', fromPath, destination: '/docs' })
                window.open('/docs', '_blank')
              }}
            >
              <Icon name="book" className="w-4 h-4 mr-2" />
              Documentation
            </Button>
            <Button variant="ghost" size="sm" asChild onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: '/privacy' })}>
              <Link href="/privacy">Privacy Policy</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild onClick={() => track({ type: 'public_footer_link_clicked', fromPath, destination: '/terms' })}>
              <Link href="/terms">Terms &amp; Conditions</Link>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  )
}
