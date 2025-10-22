import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'

export default function Security() {
  const items = [
    { icon: 'shield-check', text: 'Process isolation for runs (child/remote runner)' },
    { icon: 'file-text', text: 'Structured events for tool calls and workflow state' },
    { icon: 'eye', text: 'Secret redaction in streamed events/logs' },
  ]
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-6">Security & reliability</h2>
        <Card className="p-6 bg-white/5 border-white/10">
          <ul className="grid md:grid-cols-3 gap-4">
            {items.map((i, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm text-white/90">
                <Icon name={i.icon} className="w-5 h-5 mt-0.5" />
                <span className="text-white/80">{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  )
}
