'use client'

import Icon from '@/components/primitives/Icon'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

type Trait = {
  id: string
  label: string
  sub: string
  icon: string
  x: number
  y: number
}

function TraitCard({ trait, setRef }: { trait: Pick<Trait, 'id' | 'label' | 'sub' | 'icon'>; setRef?: (el: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={setRef}
      className="relative w-full xl:w-[300px] rounded-xl border border-white/12 bg-white/[0.05] px-5 py-4 shadow-[0_0_18px_rgba(168,85,247,0.12),0_0_34px_rgba(59,130,246,0.08)] select-text"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-black/30">
          <Icon name={trait.icon} className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 select-text">
          <div className="text-base font-medium text-foreground leading-tight">{trait.label}</div>
          <div className="mt-1 text-sm text-muted-foreground leading-snug">{trait.sub}</div>
        </div>
      </div>
    </div>
  )
}

export default function WhatAreAgents() {
  const [isXl, setIsXl] = useState(false)

  // Render only one diagram DOM variant at a time so our refs (canvas/orb/cards) always point
  // at the visible layout (avoids measuring hidden elements).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return
    const mql = window.matchMedia('(min-width: 1280px)') // Tailwind `xl`
    const apply = () => setIsXl(Boolean(mql.matches))
    apply()
    // Safari < 14 uses addListener/removeListener
    // eslint-disable-next-line deprecation/deprecation
    if (typeof (mql as any).addEventListener === 'function') {
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(apply)
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(apply)
  }, [])

  const agent = useMemo(() => {
    return {
      label: 'Agent',
      sub: 'Anatomy of an agent',
      icon: 'head-circuit',
      x: 520,
      y: 10,
    }
  }, [])

  const traits = useMemo<Trait[]>(() => {
    return [
      { id: 'identity', label: 'Identity', sub: 'Its name, avatar, and personality, plus how it shows up in your workspace', icon: 'fingerprint', x: 0, y: 270 },
      { id: 'role', label: 'Role', sub: 'Its job description, what it owns, what “done” looks like, and what to prioritize', icon: 'user-cog', x: 400, y: 270 },
      { id: 'instructions', label: 'Instructions', sub: 'The rules it follows, including tone, steps to take, and output format', icon: 'file-text', x: 800, y: 270 },
      { id: 'tools', label: 'Tools', sub: 'The actions it can take, which apps it can access, and what it’s allowed to do', icon: 'wrench', x: 200, y: 480 },
      { id: 'autonomy', label: 'Autonomy', sub: 'The guardrails, what it can do automatically, and when it should ask you first', icon: 'shield-check', x: 600, y: 480 },
    ]
  }, [])

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const orbRef = useRef<HTMLDivElement | null>(null)
  const traitRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [paths, setPaths] = useState<Array<{ id: string; d: string }>>([])

  const computePaths = () => {
    const canvas = canvasRef.current
    const orb = orbRef.current
    if (!canvas || !orb) return

    const canvasRect = canvas.getBoundingClientRect()
    const orbRect = orb.getBoundingClientRect()

    const startX = orbRect.left - canvasRect.left + orbRect.width / 2
    const startY = orbRect.top - canvasRect.top + orbRect.height

    const next: Array<{ id: string; d: string }> = []

    for (const t of traits) {
      const el = traitRefs.current[t.id]
      if (!el) continue
      const r = el.getBoundingClientRect()

      const endX = r.left - canvasRect.left + r.width / 2
      const endY = r.top - canvasRect.top

      // Smooth cubic curve from agent orb to card top-center
      const dy = endY - startY
      const c1x = startX
      const c1y = startY + Math.max(60, dy * 0.45)
      const c2x = endX
      const c2y = endY - Math.max(60, dy * 0.25)
      const d = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`

      next.push({ id: `edge-${t.id}`, d })
    }

    setPaths(next)
  }

  useLayoutEffect(() => {
    computePaths()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traits, isXl])

  useEffect(() => {
    computePaths()

    const onResize = () => computePaths()
    window.addEventListener('resize', onResize)

    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && canvasRef.current) {
      ro = new ResizeObserver(() => computePaths())
      ro.observe(canvasRef.current)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traits, isXl])

  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 md:mb-14">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">What are agents?</h2>
          <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto">Agents are AI teammates you set up to handle tasks for you.</p>
        </div>

        <div className="mx-auto max-w-6xl">
          {!isXl ? (
            // Mobile/tablet: diagram layout (orb + connector lines + cards in flow)
            <div className="rounded-2xl bg-transparent border border-transparent px-0 sm:px-2 shadow-none">
              <div ref={canvasRef} className="relative mx-auto w-full">
                {/* Orb centered on top */}
                <div className="relative z-10 pt-2 flex flex-col items-center">
                  <div ref={orbRef} className="relative w-[92px] h-[92px] overflow-visible">
                    <div
                      title={`${agent.label}${agent.sub ? ` - ${agent.sub}` : ''}`}
                      className={[
                        'agent-anatomy-orb relative grid place-items-center rounded-full border w-full h-full',
                        'border-white/25 bg-black/35 shadow-[0_0_22px_rgba(168,85,247,0.24),0_0_44px_rgba(59,130,246,0.14)]',
                      ].join(' ')}
                    >
                      <div className="agent-anatomy-center-ring pointer-events-none absolute inset-[-12px] rounded-full" />
                      <Icon name={agent.icon} className="w-[44px] h-[44px] text-primary drop-shadow-[0_0_18px_rgba(168,85,247,0.28)]" />
                    </div>
                  </div>

                  {/* Full-width label on smaller screens */}
                  <div className="mt-2 w-full text-center leading-tight whitespace-normal select-text">
                    <div className="text-base sm:text-lg font-semibold text-foreground">{agent.label}</div>
                    <div className="text-sm sm:text-base text-muted-foreground">{agent.sub}</div>
                  </div>
                </div>

                {/* Trait cards below (still connected via SVG) */}
                <div className="relative z-10 mt-16 grid gap-3 sm:grid-cols-2">
                  {traits.map(t => (
                    <TraitCard
                      key={t.id}
                      trait={t}
                      setRef={el => {
                        traitRefs.current[t.id] = el
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Desktop: diagram (absolute positions)
            <div className="rounded-2xl bg-transparent border border-transparent px-4 pb-4 pt-0 sm:px-6 sm:pb-6 sm:pt-0 shadow-none">
              <div ref={canvasRef} className="relative mx-auto h-[720px] w-full max-w-[1152px]">
                <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" aria-hidden="true">
                  {paths.map(p => (
                    <path key={p.id} d={p.d} className="agent-anatomy-edge" />
                  ))}
                </svg>

                {/* Center agent */}
                <div className="absolute" style={{ left: agent.x, top: agent.y }}>
                  <div ref={orbRef} className="relative w-[92px] h-[92px] overflow-visible">
                    <div
                      title={`${agent.label}${agent.sub ? ` - ${agent.sub}` : ''}`}
                      className={[
                        'agent-anatomy-orb relative grid place-items-center rounded-full border w-full h-full',
                        'border-white/25 bg-black/35 shadow-[0_0_22px_rgba(168,85,247,0.24),0_0_44px_rgba(59,130,246,0.14)]',
                      ].join(' ')}
                    >
                      <div className="agent-anatomy-center-ring pointer-events-none absolute inset-[-12px] rounded-full" />
                      <Icon name={agent.icon} className="w-[44px] h-[44px] text-primary drop-shadow-[0_0_18px_rgba(168,85,247,0.28)]" />
                    </div>

                    {/* Label anchored to orb center (so text width never shifts alignment) */}
                    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 text-center leading-tight whitespace-normal select-text max-w-[14rem]">
                      <div className="text-base sm:text-lg font-semibold text-foreground">{agent.label}</div>
                      <div className="text-sm sm:text-base text-muted-foreground">{agent.sub}</div>
                    </div>
                  </div>
                </div>

                {/* Trait cards */}
                {traits.map(t => (
                  <div key={t.id} className="absolute" style={{ left: t.x, top: t.y }}>
                    <TraitCard
                      trait={t}
                      setRef={el => {
                        traitRefs.current[t.id] = el
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* A11y fallback */}
          <ul className="sr-only">
            <li>Identity</li>
            <li>Role</li>
            <li>Instructions</li>
            <li>Tools</li>
            <li>Autonomy</li>
          </ul>
        </div>
      </div>

      <style jsx>{`
        .agent-anatomy-edge {
          fill: none;
          stroke: rgba(168, 85, 247, 0.55);
          stroke-width: 2.2px;
          stroke-linecap: round;
          stroke-dasharray: 6 10;
          animation: agentEdgeDash 1.8s linear infinite;
        }
        @keyframes agentEdgeDash {
          to {
            stroke-dashoffset: -32;
          }
        }

        /* Center ring pulse */
        .agent-anatomy-center-ring {
          background: radial-gradient(closest-side, rgba(168, 85, 247, 0.18), rgba(59, 130, 246, 0.08), transparent 70%);
          animation: centerPulse 2.6s ease-in-out infinite;
          filter: blur(10px);
        }
        @keyframes centerPulse {
          0%,
          100% {
            opacity: 0.6;
            transform: scale(0.985);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
          }
        }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .agent-anatomy-edge {
            animation: none !important;
          }
          .agent-anatomy-center-ring {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  )
}
