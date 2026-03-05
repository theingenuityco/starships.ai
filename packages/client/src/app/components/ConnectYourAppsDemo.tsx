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

  const rows: ConnectorTile[][] = useMemo(() => {
    const rowA: ConnectorTile[] = []
    const rowB: ConnectorTile[] = []
    connectors.forEach((c, idx) => {
      if (idx % 2 === 0) rowA.push(c)
      else rowB.push(c)
    })
    return [rowA, rowB]
  }, [connectors])

  return (
    <div className="w-full">
      <div className="apps-marquee-shell">
        {rows.map((row, rowIndex) => {
          const isReverse = rowIndex === 1
          const loopItems = [...row, ...row]
          return (
            <div key={rowIndex} className={`apps-marquee-row ${isReverse ? 'apps-marquee-row--reverse' : ''}`}>
              <div className="apps-marquee-track">
                {loopItems.map((item, idx) => {
                  const key = `${item.provider}-${rowIndex}-${idx}`
                  const showLogo = !hiddenLogos[item.provider]
                  const src = getConnectorLogoSrc(item.provider)
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 px-3.5 py-3 rounded-lg bg-white/70 border border-slate-200/80 shadow-sm min-w-[200px]"
                      aria-label={item.label}
                    >
                      {showLogo ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-white border border-border/40">
                          <Image
                            src={src}
                            alt={`${item.label} logo`}
                            width={26}
                            height={26}
                            onError={() => setHiddenLogos(prev => ({ ...prev, [item.provider]: true }))}
                          />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10 border border-white/10" />
                      )}

                      <div className="min-w-0 text-sm sm:text-base text-slate-800 truncate">{item.label}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        .apps-marquee-shell {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .apps-marquee-row {
          overflow: hidden;
        }

        .apps-marquee-track {
          display: flex;
          gap: 0.75rem;
          will-change: transform;
          animation: apps-marquee 32s linear infinite;
        }

        .apps-marquee-row--reverse .apps-marquee-track {
          animation-direction: reverse;
        }

        @keyframes apps-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .apps-marquee-track {
            animation-duration: 0.01ms;
            animation-iteration-count: 1;
          }
        }
      `}</style>
    </div>
  )
}

