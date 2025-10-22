import { Card } from '@/components/ui/card'

export default function ProblemOutcome() {
  return (
    <section className="py-10 px-4">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-6 items-start">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold mb-3">The problem</h2>
          <Card className="p-5 bg-white/5 border-white/10">
            <ul className="list-disc ml-5 text-sm text-muted-foreground space-y-2">
              <li>Brittle scripts and LLM glue that fail silently</li>
              <li>Manual ops across tools with minimal safety controls</li>
              <li>Limited visibility into what happened during a run</li>
            </ul>
          </Card>
        </div>
        <div>
          <h3 className="text-2xl md:text-3xl font-semibold mb-3">What you get</h3>
          <Card className="p-5 bg-white/5 border-white/10">
            <ul className="list-disc ml-5 text-sm text-muted-foreground space-y-2">
              <li>Repeatable agents with scoped tool access</li>
              <li>Isolation via child/remote runner and streamed events</li>
              <li>Structured logs and message history for visibility</li>
            </ul>
          </Card>
        </div>
      </div>
    </section>
  )
}
