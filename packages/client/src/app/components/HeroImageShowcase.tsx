'use client'

import { useEffect, useState } from 'react'

import { landingFrameInset, panelLightLift } from '@/app/components/landing/landingSurface'

const SHOWCASE_IMAGES = ['/landing/showcase/github-gmail.png', '/landing/showcase/lead-generation.png', '/landing/showcase/lin.png', '/landing/showcase/gmail.png']

const SWITCH_INTERVAL_MS = 5000

/** Half of ~16:9 frame at content width — lift only the card, not the white section (see flow-root + wrapper). */
const OVERLAP_LIFT = 'clamp(5.5rem, min(72rem, calc(100vw - 2rem)) * 9 / 32, 21rem)'

const overlapHeroFrameStyle = {
  transform: `translateY(calc(-1 * (${OVERLAP_LIFT})))`,
  marginBottom: `calc(-1 * (${OVERLAP_LIFT}))`,
} as const

export default function HeroImageShowcase(props: { overlapHero?: boolean }) {
  const overlapHero = props.overlapHero !== false
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
    }, 650)

    return () => {
      clearTimeout(id)
    }
  }, [isCrossfading])

  const gradientSurfaceStyle = {
    background: [
      'linear-gradient(95deg, rgba(39,24,94,0.95) 0%, rgba(114,47,166,0.92) 42%, rgba(150,70,156,0.9) 68%, rgba(189,126,52,0.92) 100%)',
      'radial-gradient(circle at 6% 50%, rgba(99,102,241,0.30) 0%, transparent 34%)',
      'radial-gradient(circle at 96% 52%, rgba(251,191,36,0.28) 0%, transparent 34%)',
    ].join(', '),
  }

  return (
    <section className="relative z-[11] flow-root pb-16 sm:pb-20 px-4 bg-white text-slate-900">
      {/* White band stays flush under hero; only the framed mockup lifts (wrapper transform, not section margin). */}
      <div className="relative z-[12] mx-auto max-w-6xl">
        <div className="relative" style={overlapHero ? overlapHeroFrameStyle : undefined}>
          <div className={`w-full p-3 sm:p-4 md:p-5 ${panelLightLift}`} style={gradientSurfaceStyle}>
            <div className="relative w-full aspect-[16/9] overflow-hidden rounded-none">
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`relative overflow-hidden ${landingFrameInset}`}
                  style={{
                    width: '95%',
                    height: '95%',
                  }}
                >
                  {previousIndex !== null ? (
                    <img
                      src={SHOWCASE_IMAGES[previousIndex]}
                      alt=""
                      aria-hidden
                      className={`absolute inset-0 h-full w-full object-contain p-5 sm:p-6 md:p-7 transition-opacity duration-[650ms] ease-in-out ${isCrossfading ? 'opacity-0' : 'opacity-100'}`}
                    />
                  ) : null}
                  <img
                    key={SHOWCASE_IMAGES[activeIndex]}
                    src={SHOWCASE_IMAGES[activeIndex]}
                    alt={`Landing showcase ${activeIndex + 1}`}
                    className="absolute inset-0 h-full w-full object-contain p-3 sm:p-4 md:p-5 will-change-transform"
                    style={{
                      animationName: 'hero-showcase-fade-in, hero-showcase-zoom',
                      animationDuration: '650ms, 380ms',
                      animationTimingFunction: 'ease-in-out, ease-out',
                      animationDelay: '0ms, 1000ms',
                      animationFillMode: 'both, forwards',
                      transformOrigin: 'center top',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes hero-showcase-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes hero-showcase-zoom {
          from {
            transform: scale(1);
          }
          to {
            transform: scale(1.42);
          }
        }
      `}</style>
    </section>
  )
}
