'use client'

import Image from 'next/image'

import { panelLight, panelLightLift } from '@/app/components/landing/landingSurface'

const TESTIMONIALS = [
  {
    quote: '“In our first month, Starships cut weekly campaign prep from ~9 hours to under 3. The team now spends that time on experiments instead of handoffs.”',
    author: 'Rhea J',
    role: 'Business Analyst',
    sourceLogo: '/connectors/linkedin.svg',
  },
  {
    quote: '“We run daily with workspace agents now. Lead research quality improved within two weeks, and our reply rate moved from 6% to 11% in the same quarter.”',
    author: 'Showik H',
    role: 'Marketing Manager',
    sourceLogo: '/connectors/x.svg',
  },
  {
    quote: '“Before Starships, operational follow-ups slipped constantly. With shared sessions and scheduled runs, completion reliability is now consistently above 95%.”',
    author: 'Ramlah M',
    role: 'Business Owner',
    sourceLogo: '/connectors/reddit.svg',
  },
  {
    quote: '“We replaced scattered status pings with one collaborative run log. It saves our leadership team roughly 12-15 hours every month and keeps decisions faster.”',
    author: 'Matt H',
    role: 'COO',
    sourceLogo: '/connectors/facebook-pages.svg',
  },
]

export default function TestimonialsSection() {
  return (
    <section className="py-16 sm:py-20 md:py-24 px-4 text-slate-900" style={{ backgroundColor: 'hsl(38 30% 97.5%)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
            Built for <span className="text-primary">individuals and teams</span> of all sizes
          </h2>
          <p className="mt-3 text-sm md:text-base text-slate-600">From solo builders to cross-functional teams, Starships adapts to your workflow.</p>
        </div>

        <div className="mt-10 md:mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {TESTIMONIALS.map((item, idx) => (
            <article key={idx} className={`flex min-h-[230px] flex-col p-4 text-left sm:p-5 ${panelLight} ${panelLightLift}`}>
              <p className="text-[15px] leading-relaxed text-slate-800 italic">{item.quote}</p>
              <div className="mt-6 flex flex-1 flex-col justify-end border-t-2 border-slate-200/90 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.author}</p>
                    <p className="text-xs text-slate-600">{item.role}</p>
                  </div>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-2 border-slate-200 bg-white shadow-[2px_2px_0_0_rgb(226_232_240)]" aria-hidden>
                    <Image src={item.sourceLogo} alt="" width={15} height={15} className="object-contain" />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
