'use client'

import { useEffect, useState } from 'react'

const SHOWCASE_IMAGES = [
  '/landing/showcase/github-gmail.png',
  '/landing/showcase/lead-v2.png',
  '/landing/showcase/lin.png',
  '/landing/showcase/gmail.png',
]

const SWITCH_INTERVAL_MS = 5000

export default function HeroImageShowcase() {
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

  return (
    <section className="relative pb-16 sm:pb-20 px-4 bg-white text-slate-900">
      <div className="relative max-w-6xl mx-auto">
        <div className="mb-8 md:mb-10 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-slate-900">See it in action</h2>
          <p className="text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto">A simple preview of workflows running across your tools.</p>
        </div>

        <div
          className="w-full rounded-2xl border border-slate-200/70 p-3 sm:p-4 md:p-5 shadow-sm"
          style={{
            background: [
              'linear-gradient(95deg, rgba(39,24,94,0.95) 0%, rgba(114,47,166,0.92) 42%, rgba(150,70,156,0.9) 68%, rgba(189,126,52,0.92) 100%)',
              'radial-gradient(circle at 6% 50%, rgba(99,102,241,0.30) 0%, transparent 34%)',
              'radial-gradient(circle at 96% 52%, rgba(251,191,36,0.28) 0%, transparent 34%)',
            ].join(', '),
          }}
        >
          <div className="relative w-full aspect-[16/9] overflow-hidden rounded-xl">
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="relative overflow-hidden rounded-2xl border border-white/55 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]"
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
                    className={`absolute inset-0 h-full w-full object-contain p-5 sm:p-6 md:p-7 transition-opacity duration-[650ms] ease-in-out ${
                      isCrossfading ? 'opacity-0' : 'opacity-100'
                    }`}
                  />
                ) : null}
                <img
                  key={SHOWCASE_IMAGES[activeIndex]}
                  src={SHOWCASE_IMAGES[activeIndex]}
                  alt={`Landing showcase ${activeIndex + 1}`}
                  className="absolute inset-0 h-full w-full object-contain p-3 sm:p-4 md:p-5"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
