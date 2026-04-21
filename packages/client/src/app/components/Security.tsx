import Link from 'next/link'

import Icon from '@/components/primitives/Icon'

export default function Security() {
  const items = [
    {
      icon: 'shield-check',
      title: 'Isolation',
      text: 'Each run happens in its own safe space, so one job can’t affect another.',
    },
    {
      icon: 'lock',
      title: 'Secret Encryption',
      text: 'Your secrets are encrypted and kept separate for each starship.',
    },
    {
      icon: 'activity',
      title: 'Observability',
      text: 'Watch work happen live and review a clear timeline of every step.',
    },
  ]
  return (
    <section className="relative pt-10 pb-2 px-4 text-white">
      <div className="relative z-10 max-w-6xl mx-auto pt-6 sm:pt-8">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-center text-white">
          Security & <span className="text-primary">trust</span>
        </h2>
        <p className="text-sm md:text-base text-white/60 text-center max-w-2xl mx-auto mb-5 md:mb-6">Built so you can safely give AI real work, without losing control of your data or process.</p>

        <div>
          <ul className="grid gap-5 sm:gap-6 md:gap-8 md:grid-cols-3">
            {items.map((i, idx) => (
              <li
                key={idx}
                className="text-center rounded-xl border border-white/[0.08] p-5 md:p-6 shadow-sm bg-white/[0.04]"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/80 shadow-sm">
                  <Icon name={i.icon} className="w-6 h-6" />
                </div>
                <div className="mt-4 font-bold text-white/90 text-xl md:text-2xl leading-tight tracking-tight">{i.title}</div>
                <div className="mt-3 text-white/60 text-sm md:text-base leading-relaxed">{i.text}</div>
              </li>
            ))}
          </ul>
          <div className="mt-10 text-center">
            <Link
              href="/privacy"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors duration-100 hover:bg-violet-500/10 hover:no-underline rounded-md px-2 py-1"
            >
              Learn more
              <Icon name="arrow-right" className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
