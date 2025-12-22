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
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">Security & trust</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-10 md:mb-16">
          Built so you can safely give AI real work, without losing control of your data or process.
        </p>
        <div>
          <ul className="grid gap-4 sm:gap-6 md:gap-8 md:grid-cols-3">
            {items.map((i, idx) => (
              <li key={idx}>
                <Card className="h-full p-5 md:p-6 bg-white/5 border-white/10">
                  <div className="flex flex-col items-center text-center">
                    <div className="h-16 w-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Icon name={i.icon} className="w-8 h-8" />
                    </div>
                    <div className="mt-4 font-semibold text-white/90 text-sm md:text-base">{i.title}</div>
                    <div className="mt-2 md:mt-3 text-white/75 text-sm md:text-base">{i.text}</div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-10 text-center">
            <a href="/docs" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Learn more about security
              <Icon name="external-link" className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
