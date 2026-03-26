'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const SHOWCASE_IMAGES = ['/landing/usecases/people.png', '/landing/usecases/ai-members.png']
const SWITCH_INTERVAL_MS = 3000
const CROSSFADE_MS = 650

export default function InvertedShowcaseHighlights() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [previousIndex, setPreviousIndex] = useState<number | null>(null)
  const [isCrossfading, setIsCrossfading] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % SHOWCASE_IMAGES.length
        setPreviousIndex(prev)
        setIsCrossfading(true)
        return next
      })
    }, SWITCH_INTERVAL_MS)

    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isCrossfading) return
    const id = setTimeout(() => {
      setIsCrossfading(false)
      setPreviousIndex(null)
    }, CROSSFADE_MS)
    return () => clearTimeout(id)
  }, [isCrossfading])

  return (
    <section className="mb-14 md:mb-16">
      <div className="rounded-3xl border border-slate-200 p-4 sm:p-5 md:p-6 shadow-sm" style={{ backgroundColor: '#F8F8FA' }}>
        <div className="inverse-layout">
          <div className="inverse-copy text-left rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#F8F8FA' }}>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-slate-900 leading-tight">Collaborative AI Workspaces</h3>
            <p className="mt-3 text-sm sm:text-base text-slate-700 max-w-md">Shared agent sessions let your team plan, execute, and follow through together without losing context.</p>
            <div className="mt-6">
              <Link
                href="/login"
                className="inline-flex items-center justify-center h-11 px-6 text-sm sm:text-base font-semibold leading-none rounded-full whitespace-nowrap text-slate-900 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_0_0_rgba(180,83,9,1)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] transition"
              >
                Get Started
              </Link>
            </div>
          </div>

          <div
            className="inverse-visual-wrap"
            style={{
              background: [
                'linear-gradient(95deg, rgba(39,24,94,0.95) 0%, rgba(114,47,166,0.92) 42%, rgba(150,70,156,0.90) 68%, rgba(189,126,52,0.92) 100%)',
                'radial-gradient(circle at 6% 50%, rgba(99,102,241,0.30) 0%, transparent 34%)',
                'radial-gradient(circle at 96% 52%, rgba(251,191,36,0.28) 0%, transparent 34%)',
              ].join(', '),
            }}
          >
            <div className="inverse-visual-frame">
              {previousIndex !== null ? (
                <img
                  src={SHOWCASE_IMAGES[previousIndex]}
                  alt=""
                  aria-hidden
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[650ms] ease-in-out ${isCrossfading ? 'opacity-0' : 'opacity-100'}`}
                />
              ) : null}
              <img
                key={SHOWCASE_IMAGES[activeIndex]}
                src={SHOWCASE_IMAGES[activeIndex]}
                alt={`Use-case visual ${activeIndex + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  animationName: 'inverse-showcase-fade-in',
                  animationDuration: '650ms',
                  animationTimingFunction: 'ease-in-out',
                  animationFillMode: 'both',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .inverse-layout {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .inverse-copy {
          flex: 0 0 320px;
        }

        .inverse-visual-wrap {
          flex: 1 1 auto;
          border-radius: 16px;
          padding: 18px;
        }

        .inverse-visual-frame {
          position: relative;
          width: 100%;
          min-height: 280px;
          border-radius: 14px;
          overflow: hidden;
        }

        @media (min-width: 640px) {
          .inverse-layout {
            gap: 20px;
          }
          .inverse-visual-wrap {
            padding: 20px;
          }
          .inverse-visual-frame {
            min-height: 340px;
          }
        }

        @media (min-width: 1024px) {
          .inverse-layout {
            flex-direction: row;
            align-items: center;
            gap: 28px;
          }
          .inverse-visual-wrap {
            padding: 22px;
          }
          .inverse-visual-frame {
            min-height: 440px;
          }
        }

        @keyframes inverse-showcase-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </section>
  )
}
