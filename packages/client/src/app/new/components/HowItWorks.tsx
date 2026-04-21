'use client'

import { motion } from 'motion/react'

const steps = [
  {
    number: '01',
    title: 'Define your ICP',
    body: 'Tell Starships who your ideal customer is in plain language. Company size, industry, role, tech stack — whatever signals matter to you.',
    assetAlt:
      'Dark card showing ICP criteria like "B2B SaaS, 50-200 employees, VP Sales" with a glowing amber cursor positioned beside it, ready to submit',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Discover leads at scale',
    body: 'The system searches LinkedIn, company databases, and news signals simultaneously — surfacing thousands of qualified matches in seconds.',
    assetAlt:
      'Dark grid of lead cards materializing from a search pulse animation — company logos and contact names appearing row by row as the search completes',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Enrich every contact',
    body: 'Each lead gets verified email, job history, recent activity, company funding, and anything else that makes an email feel like real research.',
    assetAlt:
      'A contact profile card expanding outward with data fields filling in one by one — email address, LinkedIn URL, company funding round, recent news — each with a green check mark as it completes',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Send at warp speed',
    body: 'Starships drafts a unique, genuinely personal email for each contact. Review and approve, or let it fly autonomously.',
    assetAlt:
      'Email compose window showing a personalized message with highlighted personal details — company name, recent funding news, specific role pain point — alongside a sent counter ticking up to 10,000 dispatched',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-20 sm:py-24 px-4 sm:px-6 bg-[#0f0f0f]">
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="text-center mb-14 sm:mb-16">
          <h2 className="font-[family-name:var(--font-orbitron)] font-bold text-white text-2xl sm:text-3xl md:text-4xl tracking-tight">
            From brief to inbox in four moves.
          </h2>
          <p className="mt-3 text-white/55 text-base sm:text-lg">No configuration. No babysitting. Just results.</p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4 relative">
          {/* Connecting line on desktop */}
          <div className="hidden md:block absolute top-[3.5rem] left-[12.5%] right-[12.5%] h-px z-0" aria-hidden>
            <motion.div
              className="h-full"
              style={{
                background: 'linear-gradient(to right, rgba(245,158,11,0.5), rgba(245,158,11,0.2), rgba(245,158,11,0.5))',
                backgroundSize: '8px 1px',
                backgroundRepeat: 'repeat-x',
              }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
            />
          </div>

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="frosted-glass-card rounded-xl border border-white/10 p-6 flex flex-col gap-4 relative z-10"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Step number + icon row */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-400">
                  {step.icon}
                </div>
                <span className="font-[family-name:var(--font-orbitron)] font-bold text-amber-400 text-lg tabular-nums">
                  {step.number}
                </span>
              </div>

              <h3 className="font-[family-name:var(--font-orbitron)] font-bold text-white text-base sm:text-lg tracking-wide">
                {step.title}
              </h3>

              <p className="text-white/55 text-sm leading-relaxed">{step.body}</p>

              {/* Asset placeholder */}
              <div
                className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] h-28 flex items-center justify-center"
                role="img"
                aria-label={step.assetAlt}
              >
                <span className="text-white/20 text-xs text-center px-4">[Asset: {step.assetAlt.slice(0, 60)}…]</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
