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
    <section className="relative pt-10 pb-2 px-4 bg-white text-slate-900">
      <div className="relative z-10 max-w-6xl mx-auto pt-6 sm:pt-8">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-center text-slate-900">
          Security & <span className="text-primary">trust</span>
        </h2>
        <p className="text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto mb-5 md:mb-6">Built so you can safely give AI real work, without losing control of your data or process.</p>

        <div className="mb-0">
          <div className="mx-auto" style={{ width: '220px', maxWidth: '100%' }}>
            <video src="/landing/security/security.mov" autoPlay loop muted playsInline style={{ width: '220px', height: 'auto', display: 'block' }} />
          </div>
        </div>

        <div>
          <ul className="grid gap-5 sm:gap-6 md:gap-8 md:grid-cols-3">
            {items.map((i, idx) => (
              <li
                key={idx}
                className="text-center rounded-none border border-slate-200 p-5 md:p-6 shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
                style={{ backgroundColor: '#F8F8FA' }}
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-none border-2 border-slate-200 bg-white text-slate-800 shadow-[3px_3px_0_0_rgb(226_232_240)]">
                  <Icon name={i.icon} className="w-6 h-6" />
                </div>
                <div className="mt-4 font-bold text-slate-900 text-xl md:text-2xl leading-tight tracking-tight">{i.title}</div>
                <div className="mt-3 text-slate-600 text-sm md:text-base leading-relaxed">{i.text}</div>
              </li>
            ))}
          </ul>
          <div className="mt-10 text-center">
            <Link
              href="/privacy"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors duration-100 hover:bg-violet-50 hover:no-underline"
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
