'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'

type ConnectorTile = {
  provider: string
  label: string
}

function toSafeConnectorLogoSlug(provider: string): string {
  // Keep consistent with `StarshipConnectorsPanel` (public/connectors/*.svg).
  return String(provider)
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function getConnectorLogoSrc(provider: string): string {
  return `/connectors/${toSafeConnectorLogoSlug(provider)}.svg`
}

export default function ConnectYourAppsDemo() {
  const [hiddenLogos, setHiddenLogos] = useState<Record<string, boolean>>({})

  const connectors: ConnectorTile[] = useMemo(
    () => [
      { provider: 'gmail', label: 'Gmail' },
      { provider: 'google_drive', label: 'Google Drive' },
      { provider: 'wordpress', label: 'WordPress' },
      { provider: 'discord', label: 'Discord' },
      { provider: 'shopify', label: 'Shopify' },
      { provider: 'github', label: 'GitHub' },
      { provider: 'linkedin', label: 'LinkedIn' },
      { provider: 'cursor', label: 'Cursor' },
      { provider: 'context7', label: 'Context7' },
    ],
    []
  )

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {connectors.map(c => {
          const showLogo = !hiddenLogos[c.provider]
          const src = getConnectorLogoSrc(c.provider)
          return (
            <div
              key={c.provider}
              className="flex items-center gap-3 px-3.5 py-3 rounded bg-black/20 border border-white/10"
              aria-label={c.label}
            >
              {showLogo ? (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-white border border-border/40">
                  <Image
                    src={src}
                    alt={`${c.label} logo`}
                    width={26}
                    height={26}
                    onError={() => setHiddenLogos(prev => ({ ...prev, [c.provider]: true }))}
                  />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10 border border-white/10" />
              )}

              <div className="min-w-0 text-sm sm:text-base text-white/80 truncate">{c.label}</div>
            </div>
          )
        })}

        <div
          className="flex items-center justify-center px-3.5 py-3 rounded bg-black/20 border border-white/10"
          aria-label="And more"
        >
          <div className="min-w-0 text-sm sm:text-base text-white/80 truncate">and more...</div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mt-3">Grant scoped access so agents can read, write, and act safely.</div>
    </div>
  )
}

