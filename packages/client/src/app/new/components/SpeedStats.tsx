'use client'

import { motion, useInView } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

function useCountUp(target: number, duration = 1400, active = false) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) return
    const start = performance.now()
    let raf: number

    function step(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * target))
      if (progress < 1) raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, target, duration])

  return value
}

function StatCard({
  prefix,
  number,
  suffix,
  label,
  isText,
  index,
}: {
  prefix?: string
  number: number
  suffix?: string
  label: string
  isText?: boolean
  index: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const count = useCountUp(number, 1400, inView && !isText)

  return (
    <motion.div
      ref={ref}
      className="flex flex-col items-center text-center p-6 sm:p-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
    >
      <div className="font-[family-name:var(--font-orbitron)] font-black text-amber-400 tabular-nums leading-none" style={{ fontSize: 'clamp(3rem, 8vw, 5rem)' }}>
        {prefix && <span>{prefix}</span>}
        <motion.span animate={inView ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.3 }}>
          {isText ? suffix : `${count.toLocaleString()}${suffix ?? ''}`}
        </motion.span>
      </div>
      <p className="mt-3 text-sm text-white/50 max-w-[12ch] leading-snug">{label}</p>
    </motion.div>
  )
}

const stats = [
  { number: 10000, suffix: ' leads', label: 'Per 60-second run', index: 0 },
  { prefix: '$', number: 0, suffix: ' SDR cost', label: 'Per month', index: 1 },
  { number: 60, isText: true, suffix: '< 60s', label: 'From brief to first draft', index: 2 },
  { number: 4, suffix: '×', label: 'Avg reply rate vs generic outreach', index: 3 },
]

export default function SpeedStats() {
  return (
    <section className="relative py-20 sm:py-24 px-4 sm:px-6 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background: [
            'linear-gradient(to right, #050b24, #0a1040, #050b24)',
            'radial-gradient(ellipse 800px 300px at 50% 50%, rgba(245,158,11,0.06), transparent)',
          ].join(', '),
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Heading */}
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="font-[family-name:var(--font-orbitron)] font-bold text-white text-2xl sm:text-3xl md:text-4xl tracking-tight">
            The numbers that make SDRs nervous.
          </h2>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10">
          {stats.map((stat) => (
            <StatCard key={stat.index} {...stat} />
          ))}
        </div>
      </div>
    </section>
  )
}
