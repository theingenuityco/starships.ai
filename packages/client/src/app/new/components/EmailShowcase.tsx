'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

type Persona = {
  id: string
  name: string
  role: string
  context: string
  subject: string
  emailHtml: string
}

const personas: Persona[] = [
  {
    id: 'marcus',
    name: 'Marcus Bell',
    role: 'CEO @ NovaPay (fintech, 120 employees)',
    context: 'Series B announced last week. Expanding to European market.',
    subject: "Congrats on the Series B — here's how to enter Europe faster",
    emailHtml: `Hi Marcus,

Saw the announcement about <mark>NovaPay's Series B</mark> — congrats. <mark>Expanding to Europe</mark> is the obvious next move, and I'm guessing the first question your GTM team is asking is: "where do we find our first <mark>500 customers</mark>?"

Starships.ai figures out your ideal European buyer profile, discovers and enriches the right contacts across <mark>fintech ecosystems in London, Berlin, and Amsterdam</mark>, and drafts a personalized cold email for each one.

No SDRs. No Apollo juggling. One platform.

15 minutes to show you the output this week?

— [Your name]`,
  },
  {
    id: 'priya',
    name: 'Priya Nair',
    role: 'Founder @ Nair Digital (agency, 8 employees)',
    context: 'Just launched a new service line for e-commerce brands.',
    subject: 'Your new e-commerce offering — and the clients who need it most',
    emailHtml: `Hi Priya,

Noticed <mark>Nair Digital just launched an e-commerce service line</mark> — great timing. The DTC brands that desperately need what you're building are actively looking right now, but most agencies wait for inbound.

Starships.ai can map out the <mark>e-commerce founders in your city and category</mark>, enrich every contact with verified email and revenue signals, and draft a pitch that references their actual business — not a template.

You'd have a list of 2,000 qualified conversations ready by tomorrow.

Worth a look?

— [Your name]`,
  },
  {
    id: 'jordan',
    name: 'Jordan Lee',
    role: 'VP Sales @ CloudMetrics (SaaS, 340 employees)',
    context: 'Posted on LinkedIn last week about pipeline generation challenges.',
    subject: "Re: your pipeline post — there's a way out of the SDR grind",
    emailHtml: `Hi Jordan,

Saw your post last week about <mark>pipeline generation becoming a grind</mark> — you're not wrong. Most VP Sales I talk to are stuck in the same trap: more SDRs, more activity, same conversion rates.

The part that changes is usually <mark>personalization at scale</mark>. Starships.ai identifies your ICP automatically, discovers <mark>high-intent CloudMetrics prospects</mark> across funding signals and job postings, and writes an email for each one that actually references their situation.

Your team reviews the batch, approves, and sends. No research time. No template fatigue.

Open to a 15-minute demo this week?

— [Your name]`,
  },
]

function HighlightedEmail({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        if (!line) return <div key={i} className="h-2" />
        const parts = line.split(/(<mark>[^<]+<\/mark>)/)
        return (
          <p key={i} className="text-white/75 text-sm leading-relaxed">
            {parts.map((part, j) => {
              const match = part.match(/^<mark>([^<]+)<\/mark>$/)
              if (match) {
                return (
                  <mark key={j} className="bg-amber-400/20 text-amber-300 rounded px-0.5 not-italic">
                    {match[1]}
                  </mark>
                )
              }
              return part
            })}
          </p>
        )
      })}
    </div>
  )
}

export default function EmailShowcase() {
  const [activeId, setActiveId] = useState<string>('marcus')
  const active = personas.find((p) => p.id === activeId)!

  return (
    <section className="relative py-20 sm:py-24 px-4 sm:px-6 bg-[#171717]">
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="text-center mb-12 sm:mb-14">
          <h2 className="font-[family-name:var(--font-orbitron)] font-bold text-white text-2xl sm:text-3xl md:text-4xl tracking-tight max-w-3xl mx-auto leading-tight">
            Every email reads like it came from a human who did the work.
          </h2>
          <p className="mt-3 text-white/55 text-base sm:text-lg max-w-2xl mx-auto">
            Here&apos;s what Starships actually generates. Not a template. A specific email.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 lg:gap-8 items-start">
          {/* Persona selector */}
          <div className="flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={[
                  'flex-shrink-0 lg:flex-shrink text-left rounded-xl border p-4 transition-all duration-150',
                  activeId === p.id
                    ? 'border-amber-400/50 bg-amber-400/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                ].join(' ')}
              >
                <p className="font-semibold text-white text-sm">{p.name}</p>
                <p className="text-white/45 text-xs mt-0.5 leading-snug">{p.role}</p>
                <p className="text-amber-300/60 text-xs mt-2 leading-snug italic">{p.context}</p>
              </button>
            ))}
          </div>

          {/* Email preview */}
          <div className="frosted-glass-card rounded-2xl border border-white/15 bg-white/[0.03] overflow-hidden">
            {/* Email client top bar */}
            <div className="border-b border-white/10 px-5 py-4 space-y-2">
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span className="font-medium text-white/60 w-14 shrink-0">From</span>
                <span>you@yourcompany.com</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span className="font-medium text-white/60 w-14 shrink-0">To</span>
                <span>{active.name.toLowerCase().replace(' ', '.')}@{active.role.split('@')[1]?.split('(')[0]?.trim().toLowerCase().replace(/\s/g, '')}.com</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="font-medium text-white/60 text-xs w-14 shrink-0 mt-0.5">Subject</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={active.id + '-subject'}
                    className="text-white text-sm font-medium leading-snug"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {active.subject}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>

            {/* Email body */}
            <div className="px-5 py-6 min-h-[320px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <HighlightedEmail text={active.emailHtml} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer badge */}
            <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-white/35">Generated in 1.2s</span>
              </div>
              <span className="text-xs text-white/25">Based on: LinkedIn · Crunchbase · news signals</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
