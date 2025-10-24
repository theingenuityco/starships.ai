import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'

export default function HowItWorks() {
  const steps = [
    { icon: 'pencil', title: 'Define', desc: 'Describe agent behavior and tools' },
    { icon: 'plug', title: 'Connect', desc: 'Grant scoped access to tools' },
    { icon: 'rocket', title: 'Run', desc: 'Execute with process isolation (child or remote)' },
    { icon: 'activity', title: 'Observe', desc: 'Streamed events and structured logs' },
  ]
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-8 text-center">How it works</h2>
        <div className="grid md:grid-cols-4 gap-4">
          {steps.map((s, i) => (
            <Card key={i} className="p-6 bg-white/5 border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Icon name={s.icon} className="w-5 h-5" />
                <h3 className="font-medium">{s.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
