import { Card } from '@/components/ui/card'

const QA = [
  {
    q: 'How is this different from a workflow tool?',
    a: 'Agents can decide and call tools; runs are executed with process isolation and streamed events.',
  },
  {
    q: 'What happens when the model is wrong?',
    a: 'You can inspect streamed events and messages; add checks in your blueprints/tools.',
  },
  {
    q: 'Do I need my own LLM keys?',
    a: 'Bring your own provider keys via environment configuration.',
  },
  { q: 'Can I connect custom tools?', a: 'Yes. Define tools with blueprints or adapters to call your APIs.' },
  { q: 'How do you handle PII?', a: 'Secrets are redacted in emitted events; scope access via your environment.' },
  { q: 'Where do agents run?', a: 'On a runner with process isolation (child process locally or remote).' },
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
