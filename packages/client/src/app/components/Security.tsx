import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'

export default function Security() {
  const items = [
    {
      icon: 'shield-check',
      title: 'Isolation',
      text: 'Each run happens in its own safe space, so one job can’t affect another.',
      tech: 'Process isolation with per‑run resource limits and safe termination.',
    },
    {
      icon: 'lock',
      title: 'Secret Encryption',
      text: 'Your secrets are encrypted and kept separate for each starship.',
      tech: 'Encryption at rest with scoped access and managed keys.',
    },
    {
      icon: 'activity',
      title: 'Observability',
      text: 'Watch work happen live and review a clear timeline of every step.',
      tech: 'SSE streaming with heartbeats, replay buffer, and reliable reconnects.',
    },
  ]
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-2 text-center">Security & reliability</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-12 md:mb-16">Designed for safe execution and clear visibility across every run.</p>
        <div>
          <ul className="grid gap-8 md:grid-cols-3">
            {items.map((i, idx) => (
              <li key={idx}>
                <Card className="h-full p-5 md:p-6 bg-white/5 border-white/10">
                  <div className="flex flex-col items-center text-center">
                    <div className="h-16 w-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Icon name={i.icon} className="w-8 h-8" />
                    </div>
                    <div className="mt-4 font-semibold text-white/90 text-sm md:text-base">{i.title}</div>
                    <div className="mt-2 md:mt-3 text-white/75 text-sm md:text-base">{i.text}</div>
                    {i.tech && <div className="mt-2 md:mt-3 text-[11px] md:text-xs text-white/60">{i.tech}</div>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-10 text-center">
            <a href="/docs" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Read the security docs
              <Icon name="external-link" className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
