'use client'

import Image from 'next/image'

const TESTIMONIALS = [
  {
    quote:
      '“Campaign weeks were endless threads and who’s updating the doc. With Starships the work sits next to the chat. I’m not chasing people anymore. I get to look at creative again.”',
    author: 'Rhea J',
    role: 'Business Analyst',
    sourceLogo: '/connectors/linkedin.svg',
    sourceUrl: 'https://www.linkedin.com/',
  },
  {
    quote:
      '“We had too many tabs open. A couple weeks in, agents were pulling notes while we talked in the channel. Replies feel better because we’re not jumping apps every few minutes.”',
    author: 'Showik H',
    role: 'Marketing Manager',
    sourceLogo: '/connectors/x.svg',
    sourceUrl: 'https://x.com/',
  },
  {
    quote:
      '“I run a small shop. If something slips, it’s on me. One place for chat and follow-ups means I’m not losing track of small stuff. That’s been a big relief.”',
    author: 'Ramlah M',
    role: 'Business Owner',
    sourceLogo: '/connectors/reddit.svg',
    sourceUrl: 'https://www.reddit.com/',
  },
  {
    quote:
      '“Leadership updates used to live in Slack and email and nowhere felt complete. Now we have one thread people trust. We’re still messy sometimes, but we’re not guessing on status.”',
    author: 'Matt H',
    role: 'COO',
    sourceLogo: '/connectors/facebook-pages.svg',
    sourceUrl: 'https://www.facebook.com/',
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

        <div className="mt-10 md:mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
          {TESTIMONIALS.map((item, idx) => (
            <article key={idx} className={`text-left flex flex-col min-h-[230px] ${idx > 0 ? 'lg:border-l lg:border-slate-200/80 lg:pl-8' : ''}`}>
              <p className="text-[15px] leading-relaxed text-slate-800 italic">{item.quote}</p>
              <div className="mt-6 pt-4 border-t border-slate-300/70 flex items-center justify-between gap-3">
                <div>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-slate-900 hover:text-primary hover:underline underline-offset-2 transition-colors"
                  >
                    {item.author}
                  </a>
                  <p className="text-xs text-slate-600">{item.role}</p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white" aria-hidden>
                  <Image src={item.sourceLogo} alt="" width={15} height={15} className="object-contain" />
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
