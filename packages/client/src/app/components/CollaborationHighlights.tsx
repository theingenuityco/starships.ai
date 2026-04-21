'use client'

import Image from 'next/image'

const HIGHLIGHTS = [
  {
    title: 'Scan',
    description: 'Every message is scanned and matched to the right agent to respond or take action.',
    imageSrc: '/landing/highlights/scan.png',
    imageAlt: 'Scan messages and route to the right agent',
  },
  {
    title: '@ Mention',
    description: 'Call any agent into a conversation naturally, right where your team is already talking.',
    imageSrc: '/landing/highlights/mention.png',
    imageAlt: 'Mention agents directly in conversation',
  },
  {
    title: 'Automate tasks',
    description: 'Automate recurring work with your team and workspace agents.',
    imageSrc: '/landing/highlights/task-assigning.png',
    imageAlt: 'Assign and track tasks with agents',
  },
]

export default function CollaborationHighlights() {
  return (
    <section className="mb-10 md:mb-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {HIGHLIGHTS.map(item => (
          <article
            key={item.title}
            className="rounded-xl border border-white/[0.08] p-4 md:p-5 shadow-sm bg-white/[0.04]"
          >
            <h4 className="text-base font-semibold text-white/90 md:text-lg">{item.title}</h4>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{item.description}</p>
            <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
              <div className="relative w-full aspect-[16/9]">
                <Image src={item.imageSrc} alt={item.imageAlt} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover object-left-top" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
