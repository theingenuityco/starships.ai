import { Card } from '@/components/ui/card'
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
    <section className="relative pt-10 pb-0 px-4 bg-white text-slate-900">
      {/* Blend the warm section above into this white block, without covering the heading */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-12 sm:h-16 z-0"
        style={{
          background: 'linear-gradient(to bottom, #FBF5ED 0%, #FBF5ED 40%, rgba(255,255,255,0) 100%)',
        }}
        aria-hidden
      />
      <div className="relative z-10 max-w-6xl mx-auto pt-6 sm:pt-8">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center text-slate-900">Security & trust</h2>
        <p className="text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto mb-10 md:mb-16">Built so you can safely give AI real work, without losing control of your data or process.</p>
        <div>
          <ul className="grid gap-4 sm:gap-6 md:gap-8 md:grid-cols-3">
            {items.map((i, idx) => (
              <li key={idx}>
                <Card className="relative h-full overflow-hidden rounded-3xl border border-[#FFE3A3] bg-[#FFF9F0]/90 shadow-none">
                  <div className="pointer-events-none absolute inset-x-6 -top-16 h-32 rounded-[2rem] bg-gradient-to-b from-amber-300/30 via-amber-200/10 to-transparent opacity-70" />
                  <div className="relative p-5 md:p-6 flex flex-col items-center md:items-start text-center md:text-left">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 ring-1 ring-amber-200/70 shadow-sm">
                      <Icon name={i.icon} className="w-6 h-6" />
                    </div>
                    <div className="mt-4 font-semibold text-slate-900 text-sm md:text-base">{i.title}</div>
                    <div className="mt-2 md:mt-3 text-slate-600 text-sm md:text-base leading-relaxed">{i.text}</div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-10 text-center">
            <a href="/docs" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Learn more
              <Icon name="external-link" className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
