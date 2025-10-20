import { Card } from '@/components/ui/card'

const QA = [
  {
    q: 'How is this different from a workflow tool?',
    a: 'Agents decide and act with tools under guardrails; you get replayable traces and a production runner.',
  },
  {
    q: 'What happens when the model is wrong?',
    a: 'Policies, retries, and fallbacks reduce error impact; you can inspect and replay runs.',
  },
  {
    q: 'Do I need my own LLM keys?',
    a: 'Use ours to start; bring your own for control and pricing later.',
  },
  { q: 'Can I connect custom tools?', a: 'Yes, simple adapters expose your APIs or functions as tools.' },
  { q: 'How do you handle PII?', a: 'Scoped access and optional redaction; audit logs for all tool calls.' },
  { q: 'Where do agents run?', a: 'On the Autopilot Runner with isolation and predictable latency.' },
]

export default function FAQ() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-6">FAQ</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {QA.map((item, i) => (
            <Card key={i} className="p-5 bg-white/5 border-white/10">
              <div className="font-medium mb-2">{item.q}</div>
              <div className="text-sm text-muted-foreground">{item.a}</div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
