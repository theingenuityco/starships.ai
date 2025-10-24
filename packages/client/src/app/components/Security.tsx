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
      text: 'Your environment secrets are encrypted and kept separate for each project.',
    },
    {
      icon: 'activity',
      title: 'Observability',
      text: 'Watch work happen live and review a clear timeline of every step.',
    },
  ]
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-6 text-center">Security & reliability</h2>
        <p className="text-center text-sm md:text-base text-white/70 max-w-3xl mx-auto mb-6">Designed for safe execution and clear visibility across every run.</p>
        <Card className="p-6 bg-white/5 border-white/10">
          <ul className="grid gap-6 md:grid-cols-3">
            {items.map((i, idx) => (
              <li key={idx} className="flex items-start gap-4">
                <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Icon name={i.icon} className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-white/90">{i.title}</div>
                  <div className="text-sm text-white/75">{i.text}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 text-center">
            <a href="/docs" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Read the security docs
              <Icon name="external-link" className="w-3.5 h-3.5" />
            </a>
          </div>
        </Card>
      </div>
    </section>
  )
}
